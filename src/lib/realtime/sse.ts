// Server-Sent Events wire format: https://html.spec.whatwg.org/multipage/server-sent-events.html

/** One named event. JSON.stringify never emits raw newlines, so `data` stays on one line. */
export function formatSSE(event: string, data: unknown = {}): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment line. Browsers ignore it; it keeps proxies from closing an idle stream. */
export const SSE_PING = ": ping\n\n";

/** Ask the browser to wait this long before reconnecting after a drop. */
export function formatRetry(ms: number): string {
  return `retry: ${ms}\n\n`;
}
