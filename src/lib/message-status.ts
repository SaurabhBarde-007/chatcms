import type { MessageStatusName } from "./types";

// Delivery status order for messages we send: PENDING → SENT → DELIVERED → READ.
// Used by the server (WhatsApp webhooks arrive out of order) and by the dashboard
// (a slow HTTP response must not undo a newer real-time update).

const STATUS_ORDER: MessageStatusName[] = ["PENDING", "SENT", "DELIVERED", "READ"];

/** True if `next` is a step forward from `current`. FAILED always counts as one. */
export function isStatusAdvance(current: MessageStatusName, next: MessageStatusName): boolean {
  if (next === "FAILED") return current !== "FAILED";
  return STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(current);
}
