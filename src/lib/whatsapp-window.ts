// WhatsApp 24-hour customer service window.
// Free-form replies are only allowed within 24h of the customer's last message;
// outside it you must send an approved template. Used by both server and UI.

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  return now - new Date(lastInboundAt).getTime() < WINDOW_MS;
}
