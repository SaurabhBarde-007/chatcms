import type { WhatsAppStatusUpdate } from "../channels/whatsapp";
import { db } from "../db";
import { setConsent } from "./consent";

// WhatsApp's error when someone has turned off marketing messages from your business.
const USER_STOPPED_MARKETING = 131050;

/** A delivery status for a campaign message → the recipient's funnel timestamps. */
export async function onCampaignStatus(messageId: string, update: WhatsAppStatusUpdate) {
  const recipient = await db.campaignRecipient.findUnique({ where: { messageId } });
  if (!recipient) return;
  const at = update.timestamp ?? new Date();

  if (update.status === "DELIVERED") {
    await db.campaignRecipient.update({
      where: { id: recipient.id },
      data: { deliveredAt: recipient.deliveredAt ?? at, ...(recipient.status === "SENT" && { status: "DELIVERED" }) },
    });
  } else if (update.status === "READ") {
    await db.campaignRecipient.update({
      where: { id: recipient.id },
      // A read message was delivered too, even if that webhook never came.
      data: { readAt: recipient.readAt ?? at, deliveredAt: recipient.deliveredAt ?? at, status: "READ" },
    });
  } else if (update.status === "FAILED") {
    await db.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "FAILED", failedAt: at, error: update.error ?? "Failed", errorCode: update.errorCode ?? null },
    });
    if (update.errorCode === USER_STOPPED_MARKETING) {
      await setConsent(recipient.contactId, "OPTED_OUT", "whatsapp", db, at);
    }
  }
}
