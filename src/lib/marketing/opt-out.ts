// Replies that mean "stop sending me marketing messages". Matched against the whole
// message (case-insensitive, punctuation ignored), so "please stop by the store" doesn't count.

const OPT_OUT_PHRASES = new Set([
  "stop",
  "stop all",
  "stop promotions",
  "unsubscribe",
  "opt out",
  "optout",
  "remove me",
]);

export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return OPT_OUT_PHRASES.has(normalized);
}
