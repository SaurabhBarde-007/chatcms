import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { parseAmount } from "@/lib/payments/money";
import { createPaymentRequest, listPayments, paymentSummary, requestPaymentInChat } from "@/lib/payments/payments";

const querySchema = z.object({
  status: z.enum(["CREATED", "PARTIALLY_PAID", "PAID", "EXPIRED", "CANCELLED"]).optional(),
  q: z.string().optional(),
  contactId: z.string().optional(),
  campaignId: z.string().optional(),
  cursor: z.string().optional(),
});

// GET /api/payments?status=&q=&contactId=&campaignId=&cursor= → { payments, nextCursor, summary }
export async function GET(req: NextRequest) {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  const [list, summary] = await Promise.all([listPayments(parsed.data), paymentSummary(30)]);
  return NextResponse.json({ ...list, summary });
}

const bodySchema = z.object({
  /** Send it in this WhatsApp chat (needs the 24h window), or just create the link for a contact. */
  conversationId: z.string().optional(),
  contactId: z.string().optional(),
  /** With contactId: also send it in their WhatsApp chat (needs the 24h window). */
  sendInChat: z.boolean().optional(),
  amount: z.union([z.number(), z.string()]), // rupees
  description: z.string().trim().min(1).max(500),
  expiresInHours: z.number().int().min(1).max(4320).optional(),
});

// POST /api/payments → create a payment link (and send it in the chat if conversationId is given)
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payment" }, { status: 400 });
  const { contactId, description, expiresInHours, sendInChat } = parsed.data;
  let conversationId = parsed.data.conversationId;
  if (!conversationId && contactId && sendInChat) {
    const conversation = await db.conversation.findFirst({ where: { contactId, channel: "WHATSAPP" } });
    if (!conversation) return NextResponse.json({ error: "This contact has never messaged you on WhatsApp, so the link can't be sent in a chat. Create it without sending, or use a campaign." }, { status: 400 });
    conversationId = conversation.id;
  }
  const amount = parseAmount(parsed.data.amount);
  if (!amount) return NextResponse.json({ error: "Enter a valid amount" }, { status: 400 });
  try {
    if (conversationId) return NextResponse.json(await requestPaymentInChat({ conversationId, amount, description, expiresInHours }), { status: 201 });
    if (!contactId) return NextResponse.json({ error: "Choose a contact" }, { status: 400 });
    return NextResponse.json(await createPaymentRequest({ contactId, amount, description, expiresInHours, sentVia: "manual" }), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
