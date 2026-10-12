import type { PaymentStatus, Prisma } from "@/generated/prisma/client";
import { sendReply } from "../conversations";
import { db } from "../db";
import { UserError } from "../errors";
import { fillText, getSetting } from "../settings";
import { isWindowOpen } from "../whatsapp-window";
import { formatMoney, MAX_AMOUNT, MIN_AMOUNT } from "./money";
import { cancelPaymentLink, createPaymentLink, RazorpayError } from "./razorpay";

// Collecting payments from customers: a Razorpay payment link per request, sent on WhatsApp
// (in a chat, or per recipient in a campaign). Razorpay's webhook tells us when it's paid.

export class PaymentError extends UserError {}

export type PaymentDTO = {
  id: string;
  contact: { id: string; name: string | null; phone: string | null };
  campaign: { id: string; name: string } | null;
  amount: number;
  amountPaid: number;
  currency: string;
  description: string;
  status: PaymentStatus;
  shortUrl: string | null;
  sentVia: string | null;
  paymentMethod: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

type Row = Prisma.PaymentRequestGetPayload<{ include: { contact: true; campaign: { select: { id: true; name: true } } } }>;

function toDTO(p: Row): PaymentDTO {
  return {
    id: p.id,
    contact: { id: p.contact.id, name: p.contact.name, phone: p.contact.waId ? "+" + p.contact.waId : p.contact.phone },
    campaign: p.campaign,
    amount: p.amount,
    amountPaid: p.amountPaid,
    currency: p.currency,
    description: p.description,
    status: p.status,
    shortUrl: p.shortUrl,
    sentVia: p.sentVia,
    paymentMethod: p.paymentMethod,
    expiresAt: p.expiresAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

const include = { contact: true, campaign: { select: { id: true, name: true } } } as const;

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

export type NewPayment = {
  contactId: string;
  amount: number; // paise
  description: string;
  expiresInHours?: number;
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  sentVia: "chat" | "campaign" | "manual";
};

/** Create the payment request and its Razorpay link. */
export async function createPaymentRequest(input: NewPayment): Promise<PaymentDTO> {
  if (!Number.isInteger(input.amount) || input.amount < MIN_AMOUNT) throw new PaymentError(`The amount must be at least ${formatMoney(MIN_AMOUNT)}`);
  if (input.amount > MAX_AMOUNT) throw new PaymentError(`The amount can be at most ${formatMoney(MAX_AMOUNT)}`);
  const description = input.description.trim();
  if (!description) throw new PaymentError("Add a description (what the payment is for)");

  const contact = await db.contact.findUnique({ where: { id: input.contactId } });
  if (!contact) throw new PaymentError("Contact not found");

  const settings = await getSetting("payments");
  // Razorpay needs at least ~15 minutes and at most 6 months.
  const hours = Math.min(Math.max(input.expiresInHours ?? settings.defaultExpiryHours, 1), 24 * 180);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

  const row = await db.paymentRequest.create({
    data: {
      contactId: contact.id,
      campaignId: input.campaignId ?? null,
      campaignRecipientId: input.campaignRecipientId ?? null,
      amount: input.amount,
      description,
      sentVia: input.sentVia,
      expiresAt,
    },
  });

  try {
    const link = await createPaymentLink({
      amount: input.amount,
      currency: row.currency,
      description,
      referenceId: row.id,
      customer: { name: contact.name, contact: contact.waId ? "+" + contact.waId : contact.phone, email: contact.email },
      expireBy: expiresAt,
      notes: { paymentRequestId: row.id, contactId: contact.id, ...(input.campaignId && { campaignId: input.campaignId }) },
    });
    const saved = await db.paymentRequest.update({
      where: { id: row.id },
      data: { providerLinkId: link.id, shortUrl: link.short_url },
      include,
    });
    return toDTO(saved);
  } catch (err) {
    await db.paymentRequest.delete({ where: { id: row.id } }).catch(() => {});
    if (err instanceof RazorpayError) throw new PaymentError(`Razorpay: ${err.message}`);
    throw err;
  }
}

/** Values for the request / receipt message text. */
function messageValues(p: { amount: number; currency: string; description: string; shortUrl: string | null }, name: string | null) {
  return { name: name?.split(/\s+/)[0] || "there", amount: formatMoney(p.amount, p.currency), description: p.description, link: p.shortUrl ?? "" };
}

/**
 * Create a payment link and send it in a WhatsApp chat. Only possible while the 24-hour
 * window is open (otherwise send it with a template, e.g. a campaign's "Payment link" value).
 */
export async function requestPaymentInChat(input: { conversationId: string; amount: number; description: string; expiresInHours?: number }): Promise<PaymentDTO> {
  const conversation = await db.conversation.findUnique({ where: { id: input.conversationId }, include: { contact: true } });
  if (!conversation) throw new PaymentError("Conversation not found");
  if (conversation.channel !== "WHATSAPP") throw new PaymentError("Payment links can only be sent on WhatsApp");
  if (!isWindowOpen(conversation.lastInboundAt)) {
    throw new PaymentError("The 24h WhatsApp window is closed. Send the link with a template instead (a campaign with a \"Payment link\" value).");
  }

  const payment = await createPaymentRequest({ ...input, contactId: conversation.contactId, sentVia: "chat" });
  const settings = await getSetting("payments");
  await sendReply(conversation.id, { kind: "text", text: fillText(settings.requestText, messageValues(payment, conversation.contact.name)) });
  return payment;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type PaymentFilters = { status?: PaymentStatus; q?: string; contactId?: string; campaignId?: string; cursor?: string };

export async function listPayments(f: PaymentFilters) {
  const q = f.q?.trim();
  const where: Prisma.PaymentRequestWhereInput = {
    status: f.status,
    contactId: f.contactId,
    campaignId: f.campaignId,
    ...(q && {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { contact: { name: { contains: q, mode: "insensitive" } } },
        { contact: { waId: { contains: q.replace(/\D/g, "") || q } } },
      ],
    }),
  };
  const rows = await db.paymentRequest.findMany({
    where,
    include,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, 50);
  return { payments: page.map(toDTO), nextCursor: rows.length > 50 ? page[page.length - 1].id : null };
}

export type PaymentSummary = {
  collected: number;
  pending: number;
  requests: number;
  paidCount: number;
  /** Paid ÷ requests that are finished or still open (cancelled excluded). */
  conversion: number | null;
};

export async function paymentSummary(sinceDays = 30): Promise<PaymentSummary> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const rows = await db.paymentRequest.groupBy({
    by: ["status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { amount: true, amountPaid: true },
  });
  const get = (s: PaymentStatus) => rows.find((r) => r.status === s);
  const paidCount = (get("PAID")?._count._all ?? 0) + (get("PARTIALLY_PAID")?._count._all ?? 0);
  const requests = rows.reduce((n, r) => n + r._count._all, 0);
  const considered = requests - (get("CANCELLED")?._count._all ?? 0);
  return {
    collected: rows.reduce((n, r) => n + (r._sum.amountPaid ?? 0), 0),
    pending: get("CREATED")?._sum.amount ?? 0,
    requests,
    paidCount,
    conversion: considered ? paidCount / considered : null,
  };
}

export async function cancelPayment(id: string): Promise<void> {
  const p = await db.paymentRequest.findUnique({ where: { id } });
  if (!p) throw new PaymentError("Payment not found");
  if (p.status !== "CREATED") throw new PaymentError("Only unpaid links can be cancelled");
  if (p.providerLinkId) {
    try {
      await cancelPaymentLink(p.providerLinkId);
    } catch (err) {
      if (err instanceof RazorpayError) throw new PaymentError(`Razorpay: ${err.message}`);
      throw err;
    }
  }
  await db.paymentRequest.update({ where: { id }, data: { status: "CANCELLED" } });
}

// ---------------------------------------------------------------------------
// Razorpay webhook
// ---------------------------------------------------------------------------

const EVENT_STATUS: Record<string, PaymentStatus> = {
  "payment_link.paid": "PAID",
  "payment_link.partially_paid": "PARTIALLY_PAID",
  "payment_link.expired": "EXPIRED",
  "payment_link.cancelled": "CANCELLED",
};

/* eslint-disable @typescript-eslint/no-explicit-any -- webhook JSON is loosely typed */
export async function handleRazorpayEvent(event: any): Promise<{ updated: boolean }> {
  const status = EVENT_STATUS[event?.event];
  const link = event?.payload?.payment_link?.entity;
  if (!status || !link?.id) return { updated: false };
  const payment = event?.payload?.payment?.entity;

  const existing = await db.paymentRequest.findFirst({
    where: { OR: [{ providerLinkId: link.id }, ...(link.reference_id ? [{ id: String(link.reference_id) }] : [])] },
    include: { contact: true },
  });
  if (!existing) return { updated: false };
  if (existing.status === "PAID" && status !== "PAID") return { updated: false }; // never go back from paid

  const becamePaid = status === "PAID" && existing.status !== "PAID";
  await db.paymentRequest.update({
    where: { id: existing.id },
    data: {
      status,
      amountPaid: typeof link.amount_paid === "number" ? link.amount_paid : existing.amountPaid,
      ...(payment?.id && { providerPaymentId: payment.id }),
      ...(payment?.method && { paymentMethod: payment.method }),
      ...(becamePaid && { paidAt: payment?.created_at ? new Date(payment.created_at * 1000) : new Date() }),
    },
  });

  if (becamePaid) await sendReceipt(existing.id).catch((err) => console.error("[payments] receipt failed:", err));
  return { updated: true };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "Payment received" on WhatsApp, if enabled and the 24-hour window is open. */
async function sendReceipt(paymentId: string) {
  const settings = await getSetting("payments");
  if (!settings.sendReceipt) return;
  const p = await db.paymentRequest.findUnique({ where: { id: paymentId }, include: { contact: true } });
  if (!p?.contact.waId) return;
  const conversation = await db.conversation.findUnique({
    where: { channel_externalId: { channel: "WHATSAPP", externalId: p.contact.waId } },
  });
  if (!conversation || !isWindowOpen(conversation.lastInboundAt)) return;
  await sendReply(conversation.id, {
    kind: "text",
    text: fillText(settings.receiptText, messageValues({ ...p, amount: p.amountPaid || p.amount }, p.contact.name)),
  });
}
