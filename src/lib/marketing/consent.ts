import type { OptInStatus, Prisma } from "@/generated/prisma/client";
import { db } from "../db";

// Marketing consent. Every change is recorded as a ConsentEvent (audit trail + growth chart).
//
// Who can change what:
//   manual (dashboard), api (your forms) → opt in or out
//   csv  → opt in (never re-opts someone who opted out), or opt out
//   keyword → opt out (they replied STOP, UNSUBSCRIBE, "Stop promotions"…)
//   whatsapp → opt out when they tap "Stop" on your marketing messages in WhatsApp (webhook or
//     error 131050); back in only when they resume them there
//
// Undeliverable messages (error 131026: blocked you, not on WhatsApp, outdated app — Meta doesn't
// say which) deliberately don't change consent.

export type ConsentSource = "manual" | "api" | "csv" | "keyword" | "whatsapp";

type Client = Prisma.TransactionClient | typeof db;

/** Set a contact's opt-in status. Does nothing if it's already that status. Returns true if changed. */
export async function setConsent(
  contactId: string,
  status: Exclude<OptInStatus, "UNKNOWN">,
  source: ConsentSource,
  client: Client = db,
  at = new Date(),
): Promise<boolean> {
  const { count } = await client.contact.updateMany({
    where: { id: contactId, optInStatus: { not: status } },
    data:
      status === "OPTED_IN"
        ? { optInStatus: status, optInSource: source, optInAt: at }
        : { optInStatus: status, optInSource: source, optOutAt: at },
  });
  if (count === 0) return false;
  await client.consentEvent.create({ data: { contactId, status, source, createdAt: at } });
  return true;
}

// ---------------------------------------------------------------------------
// Signals from WhatsApp
// ---------------------------------------------------------------------------

/** Meta's error when they stopped your marketing messages: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes */
export const STOPPED_MARKETING_ERROR = 131050; // "chosen to stop receiving marketing messages … from your business"

/** Which opt-out (if any) a delivery error means. */
export function optOutSourceFor(errorCode: number | undefined): ConsentSource | null {
  return errorCode === STOPPED_MARKETING_ERROR ? "whatsapp" : null;
}

/** A message to this contact failed: opt them out if the error says they stopped our marketing. */
export async function optOutForDeliveryError(contactId: string, errorCode: number | undefined, at = new Date()): Promise<boolean> {
  const source = optOutSourceFor(errorCode);
  return source ? setConsent(contactId, "OPTED_OUT", source, db, at) : false;
}

/**
 * They stopped or resumed your marketing messages inside WhatsApp (the user_preferences webhook).
 * "resume" only undoes opt-outs WhatsApp caused — never a STOP reply or one you made.
 */
export async function applyMarketingPreference(p: { waId: string; value: "stop" | "resume"; at?: Date }): Promise<boolean> {
  const contact = await db.contact.findUnique({ where: { waId: p.waId }, select: { id: true, optInStatus: true, optInSource: true } });
  if (!contact) return false;
  const at = p.at ?? new Date();
  if (p.value === "stop") return setConsent(contact.id, "OPTED_OUT", "whatsapp", db, at);
  if (contact.optInStatus === "OPTED_OUT" && contact.optInSource === "whatsapp") {
    return setConsent(contact.id, "OPTED_IN", "whatsapp", db, at);
  }
  return false;
}
