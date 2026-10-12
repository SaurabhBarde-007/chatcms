import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { isRazorpayConfigured, razorpayMode } from "@/lib/payments/razorpay";
import { getSetting, setSetting } from "@/lib/settings";

// GET /api/settings → editable settings + what's configured (never the secrets themselves)
export async function GET() {
  const [pricing, payments] = await Promise.all([getSetting("pricing"), getSetting("payments")]);
  return NextResponse.json({
    pricing,
    payments,
    status: {
      razorpay: { configured: isRazorpayConfigured(), mode: razorpayMode(), webhookSecret: Boolean(env.razorpay.webhookSecret) },
      apiKey: Boolean(env.apiKey),
      cronSecret: Boolean(env.cronSecret),
    },
  });
}

const schema = z.object({
  pricing: z
    .object({ currency: z.string().min(3).max(3), MARKETING: z.number().min(0).max(100), UTILITY: z.number().min(0).max(100), AUTHENTICATION: z.number().min(0).max(100) })
    .optional(),
  payments: z
    .object({
      sendReceipt: z.boolean(),
      requestText: z.string().min(1).max(1000),
      receiptText: z.string().min(1).max(1000),
      defaultExpiryHours: z.number().int().min(1).max(4320),
    })
    .optional(),
});

// PUT /api/settings { pricing?, payments? }
export async function PUT(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  if (parsed.data.pricing) await setSetting("pricing", parsed.data.pricing);
  if (parsed.data.payments) {
    if (!parsed.data.payments.requestText.includes("{link}")) return NextResponse.json({ error: "The payment request message must include {link}" }, { status: 400 });
    await setSetting("payments", parsed.data.payments);
  }
  return NextResponse.json({ ok: true });
}
