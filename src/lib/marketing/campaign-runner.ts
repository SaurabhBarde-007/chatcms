import { Prisma, type Campaign, type Contact } from "@/generated/prisma/client";
import { sendTemplateMessage, WhatsAppApiError } from "../channels/whatsapp";
import { db } from "../db";
import { env } from "../env";
import { REACHABLE, segmentRulesSchema, segmentWhere } from "./segments";
import { createPaymentRequest } from "../payments/payments";
import { isRazorpayConfigured } from "../payments/razorpay";
import {
  buildTemplateComponents,
  PAYMENT_LINK_PREFIX,
  paymentSources,
  renderTemplateText,
  type Template,
  type TemplateContact,
  type TemplateVariables,
  TemplateValueError,
  type ValueSource,
} from "./templates";

// Sends campaigns. Called by /api/cron/campaigns (GitHub Actions every 30 min, and a self-call
// to continue big campaigns) and right after "Send now".
//
//   SCHEDULED ──(due)──▶ SENDING ──(no recipients left)──▶ COMPLETED
//                           │ ├─ cancel ─▶ CANCELLED
//                           │ └─ error affecting every message ─▶ FAILED
//
// Safety:
// - Each recipient is claimed with FOR UPDATE SKIP LOCKED, so overlapping runs never send twice.
// - If we can't tell whether WhatsApp accepted a message (network error, crash), it's marked
//   failed and NOT retried — a missing message is better than a duplicate marketing message.
// - Opt-outs are re-checked right before each send.

const BATCH_SIZE = 25;
const CONCURRENCY = 8;
const STALE_CLAIM_MS = 10 * 60 * 1000;
/** This many failures in a row with the same error stops the campaign (it's not the recipients). */
const CIRCUIT_BREAKER = 10;
const RATE_LIMIT_PAUSE_MS = 3000;

// Meta error codes: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
/** Errors that will hit every recipient: stop the campaign. */
const FATAL_CODES = new Set([
  0, // AuthException
  3, // capability / permission
  10, // permission denied
  190, // access token expired / invalid
  200, // permission
  368, // temporarily blocked for policy violations
  131005, // access denied
  131008, // required parameter missing
  131048, // spam rate limit hit
  132000, // template parameter count mismatch
  132001, // template doesn't exist
  132007, // template format character policy violated
  132012, // template parameter format mismatch
  132015, // template paused
  132016, // template disabled
  133010, // phone number not registered
]);
/** Throughput limits: put the recipient back in the queue and slow down. */
const RETRY_CODES = new Set([4, 80007, 130429]);

export type SendErrorKind = "fatal" | "retry" | "recipient";

export function classifySendError(err: unknown): { kind: SendErrorKind; code?: number; message: string } {
  if (err instanceof WhatsAppApiError) {
    const kind = err.code !== undefined && FATAL_CODES.has(err.code) ? "fatal" : err.code !== undefined && RETRY_CODES.has(err.code) ? "retry" : "recipient";
    return { kind, code: err.code, message: err.message };
  }
  return { kind: "recipient", message: err instanceof Error ? err.message : String(err) };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Start campaigns that are due and send until `deadline` (ms timestamp).
 * Returns more: true if there's still sending left (the caller should continue later).
 */
export async function runCampaigns(deadline: number): Promise<{ more: boolean }> {
  await recoverInterruptedSends();
  await sendStaleApiRecipients();

  const due = await db.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
  for (const campaign of due) {
    await startCampaign(campaign).catch((err) =>
      stopCampaign(campaign.id, `Couldn't build the audience: ${err instanceof Error ? err.message : err}`),
    );
  }

  const sending = await db.campaign.findMany({ where: { status: "SENDING" }, orderBy: { startedAt: "asc" } });
  for (const campaign of sending) {
    if (Date.now() >= deadline) return { more: true };
    try {
      const finished = await sendCampaign(campaign, deadline);
      if (!finished) return { more: true };
    } catch (err) {
      // e.g. the database is unreachable. Leave it for the next run; claimed recipients are
      // recovered by recoverInterruptedSends().
      console.error(`[campaigns] sending ${campaign.id} failed:`, err);
    }
  }
  return { more: false };
}

/** Ask the app to run again in a fresh request (used when a run hits its time limit). */
export async function continueInNewRequest(origin: string) {
  if (!env.cronSecret) {
    console.warn("[campaigns] CRON_SECRET not set; remaining messages will go out on the next cron run");
    return;
  }
  await fetch(`${origin}/api/cron/campaigns`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.cronSecret}` },
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => console.error("[campaigns] couldn't continue in a new request:", err));
}

// ---------------------------------------------------------------------------
// Starting: snapshot the audience
// ---------------------------------------------------------------------------

async function startCampaign(campaign: Campaign) {
  const segment = campaign.segmentId ? await db.segment.findUnique({ where: { id: campaign.segmentId } }) : null;
  const where = segment ? segmentWhere(segmentRulesSchema.parse(segment.rules)) : REACHABLE;

  await db.$transaction(
    async (tx) => {
      const { count } = await tx.campaign.updateMany({
        where: { id: campaign.id, status: "SCHEDULED" },
        data: { status: "SENDING", startedAt: new Date() },
      });
      if (count === 0) return; // another run started it

      let total = 0;
      let cursor: string | undefined;
      for (;;) {
        const page = await tx.contact.findMany({
          where,
          select: { id: true },
          orderBy: { id: "asc" },
          take: 5000,
          ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        });
        if (!page.length) break;
        await tx.campaignRecipient.createMany({
          data: page.map((c) => ({ campaignId: campaign.id, contactId: c.id })),
          skipDuplicates: true,
        });
        total += page.length;
        cursor = page[page.length - 1].id;
      }

      await tx.campaign.update({
        where: { id: campaign.id },
        data: { audienceSize: total, ...(total === 0 && { status: "COMPLETED", completedAt: new Date() }) },
      });
    },
    { timeout: 120_000 },
  );
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Returns true when the campaign needs no more work right now. */
async function sendCampaign(campaign: Campaign, deadline: number): Promise<boolean> {
  const template = campaign.template as unknown as Template;
  const variables = campaign.variables as unknown as TemplateVariables;
  let streak = { key: "", count: 0 };

  while (Date.now() < deadline) {
    const current = await db.campaign.findUnique({ where: { id: campaign.id }, select: { status: true } });
    if (current?.status !== "SENDING") return true; // cancelled or stopped meanwhile

    const batch = await claimRecipients(campaign.id);
    if (!batch.length) {
      await completeIfDone(campaign.id);
      return true;
    }

    const contacts = await db.contact.findMany({ where: { id: { in: batch.map((r) => r.contactId) } } });
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const results = await mapWithConcurrency(batch, CONCURRENCY, (r) =>
      sendToRecipient(campaign, template, variables, r.id, byId.get(r.contactId), null),
    );

    const fatal = results.find((r) => r.kind === "fatal");
    if (fatal) {
      await stopCampaign(campaign.id, fatal.message ?? "WhatsApp rejected the campaign");
      return true;
    }

    for (const r of results) {
      if (r.kind !== "failed") streak = { key: "", count: 0 };
      else {
        const key = String(r.code ?? r.message);
        streak = streak.key === key ? { key, count: streak.count + 1 } : { key, count: 1 };
        if (streak.count >= CIRCUIT_BREAKER) {
          await stopCampaign(campaign.id, `Stopped after ${CIRCUIT_BREAKER} failures in a row: ${r.message}`);
          return true;
        }
      }
    }

    if (results.some((r) => r.kind === "retry")) await sleep(RATE_LIMIT_PAUSE_MS);
  }
  return false;
}

export type Outcome = { kind: "sent" | "skipped" | "retry" | "failed" | "fatal"; code?: number; message?: string };

/**
 * Who may get this message. Broadcasts: only opted-in contacts. API campaigns (replies and
 * one-off sends): anyone, except that marketing templates still respect opt-outs.
 */
export function consentProblem(
  campaign: Pick<Campaign, "type">,
  category: string,
  contact: Pick<Contact, "waId" | "optInStatus">,
): string | null {
  if (!contact.waId) return "No WhatsApp number";
  if (campaign.type === "BROADCAST") return contact.optInStatus === "OPTED_IN" ? null : "Not opted in (or opted out before the campaign reached them)";
  if (category === "MARKETING" && contact.optInStatus === "OPTED_OUT") return "Opted out of marketing messages";
  return null;
}

/** Per-send values from an API call: { "1": "Asha", "code": "482913", "url": "abc", "mediaUrl": "https://…" }. */
export function applyParams(template: Template, vars: TemplateVariables, params: Record<string, string> | null): TemplateVariables {
  if (!params) return vars;
  const text = (value: string): ValueSource => ({ from: "text", value });
  const next: TemplateVariables = { ...vars, header: { ...vars.header }, body: { ...vars.body }, buttons: { ...vars.buttons } };
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const v = String(value);
    if (key === "mediaUrl") next.headerMediaUrl = v;
    else if (key === "code") next.body["1"] = text(v);
    else if (key === "header" && template.header?.params[0]) next.header[template.header.params[0]] = text(v);
    else if (key.startsWith("header.")) next.header[key.slice(7)] = text(v);
    else if (key === "url" || /^button\.\d+$/.test(key)) {
      const button = key === "url" ? template.buttons.find((b) => b.params.length) : template.buttons.find((b) => b.index === Number(key.slice(7)));
      if (button?.params[0]) next.buttons[String(button.index)] = { ...next.buttons[String(button.index)], [button.params[0]]: text(v) };
    } else if (template.body.params.includes(key)) next.body[key] = text(v);
  }
  return next;
}

/** Create this recipient's payment link (once) and put it in place of the "payment" value. */
async function withPaymentLink(
  campaign: Campaign,
  template: Template,
  vars: TemplateVariables,
  recipientId: string,
  contact: Contact,
): Promise<TemplateVariables> {
  const [p] = paymentSources(template, vars);
  if (!p) return vars;

  const existing = await db.paymentRequest.findUnique({ where: { campaignRecipientId: recipientId } });
  let link = existing?.shortUrl ?? null;
  if (!link) {
    const attr = p.source.amountField ? Number((contact.attributes as Record<string, unknown>)?.[p.source.amountField]) : NaN;
    const rupees = Number.isFinite(attr) && attr > 0 ? attr : p.source.amount;
    if (!(rupees > 0)) throw new TemplateValueError(`No payment amount${p.source.amountField ? ` in "${p.source.amountField}"` : ""}`);
    const payment = await createPaymentRequest({
      contactId: contact.id,
      amount: Math.round(rupees * 100),
      description: p.source.description,
      expiresInHours: p.source.expiresInHours,
      campaignId: campaign.id,
      campaignRecipientId: recipientId,
      sentVia: "campaign",
    });
    link = payment.shortUrl;
  }
  if (!link) throw new TemplateValueError("Couldn't create the payment link");

  const value = p.group === "button" ? link.replace(PAYMENT_LINK_PREFIX, "") : link;
  const source: ValueSource = { from: "text", value };
  if (p.group === "header") return { ...vars, header: { ...vars.header, [p.key]: source } };
  if (p.group === "body") return { ...vars, body: { ...vars.body, [p.key]: source } };
  const key = String(p.buttonIndex);
  return { ...vars, buttons: { ...vars.buttons, [key]: { ...vars.buttons[key], [p.key]: source } } };
}

async function sendToRecipient(
  campaign: Campaign,
  template: Template,
  campaignVariables: TemplateVariables,
  recipientId: string,
  contact: Contact | undefined,
  params: Record<string, string> | null,
): Promise<Outcome> {
  const problem = contact ? consentProblem(campaign, template.category, contact) : "Contact not found";
  if (problem || !contact?.waId) {
    await db.campaignRecipient.update({ where: { id: recipientId }, data: { status: "SKIPPED", error: problem ?? "No WhatsApp number" } });
    return { kind: "skipped" };
  }

  const templateContact: TemplateContact = {
    name: contact.name,
    email: contact.email,
    waId: contact.waId,
    attributes: (contact.attributes ?? {}) as Record<string, unknown>,
  };

  let components: Record<string, unknown>[];
  let variables: TemplateVariables;
  try {
    variables = applyParams(template, campaignVariables, params);
    if (paymentSources(template, variables).length && !isRazorpayConfigured()) {
      return await failRecipient(recipientId, "fatal", "Razorpay isn't set up (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET), so payment links can't be created");
    }
    variables = await withPaymentLink(campaign, template, variables, recipientId, contact);
    components = buildTemplateComponents(template, variables, templateContact);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "FAILED", failedAt: new Date(), error: message },
    });
    return { kind: "failed", message };
  }

  // The message also appears in the customer's chat (and replies land next to it).
  const conversationId = await whatsappConversationFor(contact.id, contact.waId);
  const message = await db.message.create({
    data: {
      conversationId,
      direction: "OUT",
      senderType: "CAMPAIGN",
      type: "template",
      body: renderTemplateText(template, variables, templateContact),
      status: "PENDING",
    },
  });
  await db.campaignRecipient.update({ where: { id: recipientId }, data: { messageId: message.id } });

  try {
    const { externalId } = await sendTemplateMessage(contact.waId, template, components);
    const now = new Date();
    await db.$transaction([
      db.message.update({ where: { id: message.id }, data: { status: "SENT", externalId } }),
      db.campaignRecipient.update({ where: { id: recipientId }, data: { status: "SENT", sentAt: now } }),
    ]);
    return { kind: "sent" };
  } catch (err) {
    const error = classifySendError(err);
    if (error.kind === "retry") {
      await db.$transaction([
        db.campaignRecipient.update({
          where: { id: recipientId },
          data: { status: "PENDING", claimedAt: null, messageId: null },
        }),
        db.message.delete({ where: { id: message.id } }),
      ]);
      return { kind: "retry", code: error.code, message: error.message };
    }
    const now = new Date();
    await db.$transaction([
      db.message.update({ where: { id: message.id }, data: { status: "FAILED", error: error.message } }),
      db.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: "FAILED", failedAt: now, error: error.message, errorCode: error.code ?? null },
      }),
    ]);
    return { kind: error.kind === "fatal" ? "fatal" : "failed", code: error.code, message: error.message };
  }
}

async function failRecipient(recipientId: string, kind: "failed" | "fatal", message: string): Promise<Outcome> {
  await db.campaignRecipient.update({ where: { id: recipientId }, data: { status: "FAILED", failedAt: new Date(), error: message } });
  return { kind, message };
}

/**
 * Send one API-campaign message now (auto-reply or API call). Returns what happened.
 * Errors that would affect every message are recorded on the campaign, which stays live.
 */
export async function sendApiRecipient(recipientId: string): Promise<Outcome> {
  const { count } = await db.campaignRecipient.updateMany({
    where: { id: recipientId, status: "PENDING" },
    data: { status: "SENDING", claimedAt: new Date() },
  });
  if (!count) return { kind: "skipped", message: "Already handled" };

  const r = await db.campaignRecipient.findUnique({ where: { id: recipientId }, include: { campaign: true, contact: true } });
  if (!r) return { kind: "skipped" };
  if (r.campaign.status !== "LIVE") {
    await db.campaignRecipient.update({ where: { id: r.id }, data: { status: "SKIPPED", error: "Campaign is paused" } });
    return { kind: "skipped", message: "Campaign is paused" };
  }

  const outcome = await sendToRecipient(
    r.campaign,
    r.campaign.template as unknown as Template,
    r.campaign.variables as unknown as TemplateVariables,
    r.id,
    r.contact,
    (r.params as Record<string, string> | null) ?? null,
  );
  if (outcome.kind === "retry") {
    // Rate limited: it's back in PENDING; the next cron run (or a retry) will send it.
  } else if (outcome.kind === "fatal") {
    await db.campaign.update({ where: { id: r.campaign.id }, data: { lastError: outcome.message ?? "WhatsApp rejected the message" } });
  }
  return outcome;
}

/** API-campaign messages whose immediate send never ran (e.g. the server stopped). */
async function sendStaleApiRecipients() {
  const stale = await db.campaignRecipient.findMany({
    where: { status: "PENDING", campaign: { type: "API" }, createdAt: { lt: new Date(Date.now() - 60_000) } },
    select: { id: true },
    take: 200,
  });
  for (const r of stale) await sendApiRecipient(r.id).catch((err) => console.error("[campaigns] api send failed:", err));
}

/** The contact's WhatsApp conversation, created if needed (stays out of the inbox list until they reply). */
async function whatsappConversationFor(contactId: string, waId: string): Promise<string> {
  const args = {
    where: { channel_externalId: { channel: "WHATSAPP" as const, externalId: waId } },
    create: { channel: "WHATSAPP" as const, externalId: waId, contactId, status: "HUMAN" as const },
    update: {},
    select: { id: true },
  };
  try {
    return (await db.conversation.upsert(args)).id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return (await db.conversation.upsert(args)).id;
    }
    throw err;
  }
}

/** Atomically take the next PENDING recipients. Concurrent runs get different rows. */
async function claimRecipients(campaignId: string): Promise<{ id: string; contactId: string }[]> {
  return db.$queryRaw<{ id: string; contactId: string }[]>`
    UPDATE "CampaignRecipient" SET status = 'SENDING', "claimedAt" = now()
    WHERE id IN (
      SELECT id FROM "CampaignRecipient"
      WHERE "campaignId" = ${campaignId} AND status = 'PENDING'
      ORDER BY id
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "contactId"`;
}

async function completeIfDone(campaignId: string) {
  const remaining = await db.campaignRecipient.count({
    where: { campaignId, status: { in: ["PENDING", "SENDING"] } },
  });
  if (remaining === 0) {
    await db.campaign.updateMany({
      where: { id: campaignId, status: "SENDING" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }
}

/** Stop for good (an error that would affect every message). Unsent recipients are skipped. */
export async function stopCampaign(campaignId: string, reason: string) {
  console.error(`[campaigns] stopping ${campaignId}: ${reason}`);
  await db.$transaction([
    db.campaign.updateMany({
      where: { id: campaignId, status: { in: ["SCHEDULED", "SENDING"] } },
      data: { status: "FAILED", lastError: reason, completedAt: new Date() },
    }),
    db.campaignRecipient.updateMany({
      where: { campaignId, status: "PENDING" },
      data: { status: "SKIPPED", error: `Campaign stopped: ${reason}` },
    }),
  ]);
}

/**
 * A run that died mid-send (crash, platform time limit) leaves recipients in SENDING.
 * If WhatsApp gave us an id, it was sent; otherwise we can't know, so it's marked failed.
 */
async function recoverInterruptedSends() {
  const stale = new Date(Date.now() - STALE_CLAIM_MS);
  await db.$executeRaw`
    UPDATE "CampaignRecipient" r SET status = 'SENT', "sentAt" = m."createdAt"
    FROM "Message" m
    WHERE r."messageId" = m.id AND r.status = 'SENDING' AND r."claimedAt" < ${stale} AND m."externalId" IS NOT NULL`;
  await db.$executeRaw`
    UPDATE "Message" SET status = 'FAILED', error = 'Interrupted while sending'
    WHERE id IN (SELECT "messageId" FROM "CampaignRecipient" WHERE status = 'SENDING' AND "claimedAt" < ${stale})`;
  await db.$executeRaw`
    UPDATE "CampaignRecipient" SET status = 'FAILED', "failedAt" = now(),
      error = 'Interrupted while sending; not retried to avoid sending twice'
    WHERE status = 'SENDING' AND "claimedAt" < ${stale}`;
}

// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
