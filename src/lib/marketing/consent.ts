import type { OptInStatus, Prisma } from "@/generated/prisma/client";
import { db } from "../db";

// Marketing consent. Every change is recorded as a ConsentEvent (audit trail + growth chart).
//
// Who can change what:
//   manual (dashboard), api (your forms) → opt in or out
//   csv  → opt in (never re-opts someone who opted out), or opt out
//   keyword (STOP reply), whatsapp (user blocked marketing) → opt out

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
