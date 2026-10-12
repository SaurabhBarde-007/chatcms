import { db } from "./db";

// App settings, stored as one JSON value per key (Setting table), with defaults.

/** What WhatsApp charges per delivered message, for cost estimates. Defaults: India, Oct 2026 list rates. */
export type Pricing = { currency: string; MARKETING: number; UTILITY: number; AUTHENTICATION: number };
export const DEFAULT_PRICING: Pricing = { currency: "INR", MARKETING: 0.8631, UTILITY: 0.115, AUTHENTICATION: 0.115 };

export type PaymentSettings = {
  /** Send a WhatsApp "payment received" message (only possible within 24h of their last message). */
  sendReceipt: boolean;
  /** {name}, {amount}, {description}, {link} are filled in. */
  requestText: string;
  receiptText: string;
  defaultExpiryHours: number;
};
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  sendReceipt: true,
  requestText: "Hi {name}, please pay {amount} for {description} using this secure link: {link}",
  receiptText: "Thank you {name}! We've received your payment of {amount} for {description}.",
  defaultExpiryHours: 72,
};

const DEFAULTS = { pricing: DEFAULT_PRICING, payments: DEFAULT_PAYMENT_SETTINGS };
type Settings = typeof DEFAULTS;

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...DEFAULTS[key], ...((row?.value as object | undefined) ?? {}) } as Settings[K];
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}

/** Fill {placeholders} in a message template. */
export function fillText(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}
