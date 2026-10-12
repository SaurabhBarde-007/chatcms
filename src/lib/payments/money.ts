// Money is stored in the currency's smallest unit (paise). Browser-safe.

export function formatMoney(minor: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}

/** "1,499.50" / "1499" → 149950 paise, or null if it isn't a valid amount. */
export function parseAmount(text: string | number): number | null {
  const n = typeof text === "number" ? text : Number(String(text).replace(/[,\s₹]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Razorpay's minimum is ₹1. */
export const MIN_AMOUNT = 100;
export const MAX_AMOUNT = 50_000_000; // ₹5,00,000 per link, a sensible cap
