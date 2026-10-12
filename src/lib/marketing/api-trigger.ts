import { z } from "zod";

// When an API campaign sends automatically, and which one applies to an incoming message.
// Pure (no database) so the campaign form can use the same rules in the browser.

export const triggerSchema = z.object({
  incoming: z.object({
    enabled: z.boolean(),
    /** ANY: every message (respecting the cooldown). FIRST_MESSAGE: a new contact's first message. KEYWORDS: the message contains a keyword. */
    match: z.enum(["ANY", "FIRST_MESSAGE", "KEYWORDS"]),
    keywords: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    /** Don't send this campaign to the same person again within this many hours (0 = no limit). */
    cooldownHours: z.number().min(0).max(720).default(24),
  }),
});
export type ApiTrigger = z.infer<typeof triggerSchema>;

export const DEFAULT_TRIGGER: ApiTrigger = { incoming: { enabled: true, match: "ANY", keywords: [], cooldownHours: 24 } };

// ---------------------------------------------------------------------------
// Matching (pure)
// ---------------------------------------------------------------------------

/** "Price?" matches keyword "price"; "pricelist" doesn't. Phrases match as phrases. */
export function containsKeyword(text: string, keywords: string[]): boolean {
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  return keywords.some((k) => {
    const kw = k.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return kw.length > 0 && t.includes(` ${kw} `);
  });
}

const PRIORITY = { KEYWORDS: 0, FIRST_MESSAGE: 1, ANY: 2 } as const;

/**
 * Which auto-reply campaigns apply to this incoming message, best first:
 * keyword matches, then "first message", then "any message"; older campaigns first.
 */
export function matchingCampaigns<T extends { id: string; createdAt: Date; trigger: ApiTrigger }>(
  campaigns: T[],
  message: { text: string | null | undefined; isFirstMessage: boolean },
): T[] {
  const text = message.text ?? "";
  return campaigns
    .filter((c) => {
      const t = c.trigger.incoming;
      if (!t.enabled) return false;
      if (t.match === "KEYWORDS") return containsKeyword(text, t.keywords);
      if (t.match === "FIRST_MESSAGE") return message.isFirstMessage;
      return true;
    })
    .sort((a, b) => PRIORITY[a.trigger.incoming.match] - PRIORITY[b.trigger.incoming.match] || a.createdAt.getTime() - b.createdAt.getTime());
}

export function parseTrigger(value: unknown): ApiTrigger {
  const parsed = triggerSchema.safeParse(value);
  return parsed.success ? parsed.data : { incoming: { ...DEFAULT_TRIGGER.incoming, enabled: false } };
}
