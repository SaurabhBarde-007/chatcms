import crypto from "node:crypto";
import { env } from "../env";

// Razorpay Payment Links: https://razorpay.com/docs/api/payments/payment-links/

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

export function isRazorpayConfigured(): boolean {
  return Boolean(env.razorpay.keyId && env.razorpay.keySecret);
}

/** "test" or "live" from the key id (rzp_test_… / rzp_live_…). */
export function razorpayMode(): "test" | "live" | null {
  const id = env.razorpay.keyId;
  return id.startsWith("rzp_live_") ? "live" : id.startsWith("rzp_test_") ? "test" : id ? "test" : null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isRazorpayConfigured()) throw new RazorpayError("Razorpay isn't set up: add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64");
  const res = await fetch(`${env.razorpay.apiBase}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new RazorpayError(data?.error?.description ?? `Razorpay error ${res.status}`, res.status);
  return data as T;
}

export type RazorpayLink = { id: string; short_url: string; status: string; amount: number; amount_paid: number };

export function createPaymentLink(input: {
  amount: number; // paise
  currency: string;
  description: string;
  referenceId: string;
  customer: { name?: string | null; contact?: string | null; email?: string | null };
  expireBy: Date;
  notes: Record<string, string>;
}): Promise<RazorpayLink> {
  const customer = Object.fromEntries(Object.entries(input.customer).filter(([, v]) => v)) as Record<string, string>;
  return call<RazorpayLink>("POST", "/payment_links", {
    amount: input.amount,
    currency: input.currency,
    accept_partial: false,
    description: input.description.slice(0, 2048),
    reference_id: input.referenceId.slice(0, 40),
    customer,
    expire_by: Math.floor(input.expireBy.getTime() / 1000),
    // We send the link over WhatsApp ourselves.
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: input.notes,
  });
}

export function cancelPaymentLink(id: string): Promise<RazorpayLink> {
  return call<RazorpayLink>("POST", `/payment_links/${encodeURIComponent(id)}/cancel`);
}

/** Razorpay signs webhooks with HMAC-SHA256 of the raw body (hex) in X-Razorpay-Signature. */
export function isValidWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
