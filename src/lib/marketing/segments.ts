import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

// A segment is a saved set of rules. Rules are evaluated when a campaign starts, so contacts
// who match later are included. A segment is ALWAYS limited to opted-in, unblocked contacts
// with a WhatsApp number — its rules can narrow that down, never widen it.
// (Broadcast audiences use these rules through ./audience-query.ts.)

export const segmentRulesSchema = z.object({
  /** Has at least one of these tags. */
  tagsAny: z.array(z.string().trim().min(1)).default([]),
  /** Has all of these tags. */
  tagsAll: z.array(z.string().trim().min(1)).default([]),
  /** Has none of these tags. */
  tagsNone: z.array(z.string().trim().min(1)).default([]),
  /** Messaged us within the last N days. */
  activeWithinDays: z.number().int().positive().max(3650).optional(),
  /** Hasn't messaged us for N days (or never has). */
  inactiveForDays: z.number().int().positive().max(3650).optional(),
  /** true: has messaged us at least once. false: never has (e.g. imported only). */
  hasMessagedUs: z.boolean().optional(),
  /** Phone country codes without "+", e.g. ["91", "971"]. */
  countryCodes: z.array(z.string().regex(/^\d{1,4}$/, "Country codes are 1–4 digits")).default([]),
  /** Opted in within the last N days. */
  optedInWithinDays: z.number().int().positive().max(3650).optional(),
});

export type SegmentRules = z.infer<typeof segmentRulesSchema>;

export const EMPTY_RULES: SegmentRules = segmentRulesSchema.parse({});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everyone a campaign may message: opted in, not blocked, with a WhatsApp number. */
export const REACHABLE: Prisma.ContactWhereInput = { optInStatus: "OPTED_IN", blocked: false, waId: { not: null } };

/** Rules → Prisma filter (always within REACHABLE). */
export function segmentWhere(rules: SegmentRules, now = Date.now()): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [REACHABLE];
  const daysAgo = (days: number) => new Date(now - days * DAY_MS);
  const inbound = (since?: Date): Prisma.ContactWhereInput => ({
    conversations: { some: { channel: "WHATSAPP", lastInboundAt: since ? { gte: since } : { not: null } } },
  });

  if (rules.tagsAny.length) and.push({ tags: { hasSome: rules.tagsAny } });
  if (rules.tagsAll.length) and.push({ tags: { hasEvery: rules.tagsAll } });
  if (rules.tagsNone.length) and.push({ NOT: { tags: { hasSome: rules.tagsNone } } });
  if (rules.activeWithinDays) and.push(inbound(daysAgo(rules.activeWithinDays)));
  if (rules.inactiveForDays) and.push({ NOT: inbound(daysAgo(rules.inactiveForDays)) });
  if (rules.hasMessagedUs === true) and.push(inbound());
  if (rules.hasMessagedUs === false) and.push({ NOT: inbound() });
  if (rules.countryCodes.length) and.push({ OR: rules.countryCodes.map((cc) => ({ waId: { startsWith: cc } })) });
  if (rules.optedInWithinDays) and.push({ optInAt: { gte: daysAgo(rules.optedInWithinDays) } });

  return { AND: and };
}

/** One-line summary, e.g. "Tagged vip or gold · active in last 30 days · +91". */
export function describeRules(rules: SegmentRules): string {
  const parts: string[] = [];
  if (rules.tagsAny.length) parts.push(`tagged ${rules.tagsAny.join(" or ")}`);
  if (rules.tagsAll.length) parts.push(`tagged ${rules.tagsAll.join(" and ")}`);
  if (rules.tagsNone.length) parts.push(`not tagged ${rules.tagsNone.join(" or ")}`);
  if (rules.activeWithinDays) parts.push(`active in last ${rules.activeWithinDays} days`);
  if (rules.inactiveForDays) parts.push(`inactive for ${rules.inactiveForDays}+ days`);
  if (rules.hasMessagedUs === true) parts.push("has messaged us");
  if (rules.hasMessagedUs === false) parts.push("never messaged us");
  if (rules.countryCodes.length) parts.push(rules.countryCodes.map((c) => "+" + c).join(", "));
  if (rules.optedInWithinDays) parts.push(`opted in within ${rules.optedInWithinDays} days`);
  const text = parts.join(" · ") || "all opted-in contacts";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
