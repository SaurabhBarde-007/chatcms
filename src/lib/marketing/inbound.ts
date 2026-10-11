import { db } from "../db";
import { setConsent } from "./consent";
import { isOptOutMessage } from "./opt-out";

// What an incoming WhatsApp message means for marketing:
//   - "STOP" (and similar) opts the contact out
//   - a reply to a campaign counts as engagement: matched exactly when they replied to /
//     tapped a button on the campaign message, otherwise to their latest campaign in the last 3 days

const REPLY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function onWhatsAppInbound(input: {
  contactId: string;
  type: string;
  body?: string | null;
  replyToExternalId?: string | null;
  at: Date;
}) {
  const optOut = isOptOutMessage(input.body);
  if (optOut) await setConsent(input.contactId, "OPTED_OUT", "keyword", db, input.at);

  const recipient = await findCampaignRecipient(input);
  if (!recipient) return;

  await db.campaignRecipient.update({
    where: { id: recipient.id },
    data: {
      ...(!recipient.repliedAt && { repliedAt: input.at }),
      ...(input.type === "button" && !recipient.buttonAt && { buttonAt: input.at, buttonText: input.body ?? null }),
      ...(optOut && !recipient.optedOutAt && { optedOutAt: input.at }),
    },
  });
}

async function findCampaignRecipient(input: { contactId: string; replyToExternalId?: string | null; at: Date }) {
  if (input.replyToExternalId) {
    const message = await db.message.findUnique({
      where: { externalId: input.replyToExternalId },
      select: { campaignRecipient: true },
    });
    if (message?.campaignRecipient) return message.campaignRecipient;
  }
  return db.campaignRecipient.findFirst({
    where: { contactId: input.contactId, sentAt: { gte: new Date(input.at.getTime() - REPLY_WINDOW_MS), lte: input.at } },
    orderBy: { sentAt: "desc" },
  });
}
