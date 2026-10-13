import { db } from "./db";

// App settings, stored as one JSON value per key (Setting table), with defaults.

/** What WhatsApp charges per delivered message, for cost estimates. Defaults: India, Oct 2026 list rates. */
export type Pricing = { currency: string; MARKETING: number; UTILITY: number; AUTHENTICATION: number };
export const DEFAULT_PRICING: Pricing = { currency: "INR", MARKETING: 0.8631, UTILITY: 0.115, AUTHENTICATION: 0.115 };

const DEFAULTS = { pricing: DEFAULT_PRICING };
type Settings = typeof DEFAULTS;

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return { ...DEFAULTS[key], ...((row?.value as object | undefined) ?? {}) } as Settings[K];
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}
