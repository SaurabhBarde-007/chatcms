import { graph } from "../channels/whatsapp";
import { db } from "../db";
import { env } from "../env";

// Your WhatsApp number's health: quality rating, messaging limit ("tier") and how much of it
// was used in the last 24 hours. Shown above the campaigns list.

export type AccountStatus = {
  phone: string | null;
  name: string | null;
  quality: string | null; // GREEN | YELLOW | RED | UNKNOWN
  tier: string | null; // TIER_250 | TIER_2K | TIER_10K | TIER_100K | TIER_UNLIMITED
  /** Unique people you can message outside a customer-service window per 24h (null = unlimited / unknown). */
  limit: number | null;
  /** Unique people this app messaged with templates in the last 24h (an estimate of what counts). */
  usedLast24h: number;
  remaining: number | null;
  error: string | null;
};

const TIER_LIMITS: Record<string, number | null> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: null,
};

export function tierLimit(tier: string | null | undefined): number | null {
  if (!tier) return null;
  if (tier in TIER_LIMITS) return TIER_LIMITS[tier];
  const m = /^TIER_(\d+)(K?)$/.exec(tier);
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : null;
}

let cache: { at: number; value: Omit<AccountStatus, "usedLast24h" | "remaining"> } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function phoneInfo() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const p = await graph<Record<string, string>>(
      `${env.whatsapp.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit`,
    );
    const tier = p.whatsapp_business_manager_messaging_limit ?? null;
    const value = {
      phone: p.display_phone_number ?? null,
      name: p.verified_name ?? null,
      quality: p.quality_rating ?? null,
      tier,
      limit: tierLimit(tier),
      error: null,
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    return { phone: null, name: null, quality: null, tier: null, limit: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getAccountStatus(): Promise<AccountStatus> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [info, used] = await Promise.all([
    phoneInfo(),
    db.$queryRaw<[{ n: number }]>`
      SELECT COUNT(DISTINCT c."contactId")::int AS n
      FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE m."createdAt" >= ${since} AND m.type = 'template' AND m.status <> 'FAILED'`,
  ]);
  const usedLast24h = used[0]?.n ?? 0;
  return { ...info, usedLast24h, remaining: info.limit === null ? null : Math.max(0, info.limit - usedLast24h) };
}
