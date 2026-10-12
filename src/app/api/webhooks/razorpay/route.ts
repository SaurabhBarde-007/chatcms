import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { handleRazorpayEvent } from "@/lib/payments/payments";
import { isValidWebhookSignature } from "@/lib/payments/razorpay";

// Razorpay webhook: https://<your-domain>/api/webhooks/razorpay
// Events: payment_link.paid, payment_link.partially_paid, payment_link.expired, payment_link.cancelled
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!isValidWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"), env.razorpay.webhookSecret)) {
    console.warn("[razorpay] rejected webhook: invalid signature. Is RAZORPAY_WEBHOOK_SECRET the webhook's secret?");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  try {
    const { updated } = await handleRazorpayEvent(event);
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    // A non-2xx makes Razorpay retry, which is what we want for unexpected errors.
    console.error("[razorpay] webhook failed:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
