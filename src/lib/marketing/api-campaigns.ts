import { z } from "zod";
import type { Campaign } from "@/generated/prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import { type Outcome, sendApiRecipient } from "./campaign-runner";
import { isOptOutMessage } from "./opt-out";
import { type ApiTrigger, matchingCampaigns, parseTrigger } from "./api-trigger";
import { normalizeWaId, waIdToPhone } from "./phone";

// API campaigns: one template, sent to one contact at a time.
//   - Auto-reply: when a customer messages you (any message, their first message, or keywords)
//   - API: your systems call POST /api/v1/campaigns/send
// Each send is a CampaignRecipient row, so the funnel and analytics work like broadcasts.

export { containsKeyword, DEFAULT_TRIGGER, matchingCampaigns, parseTrigger, triggerSchema } from "./api-trigger";
export type { ApiTrigger } from "./api-trigger";

export class ApiCampaignError extends UserError {}

// ---------------------------------------------------------------------------
// Auto-reply to incoming WhatsApp messages
// ---------------------------------------------------------------------------

/**
 * Called for every incoming customer message. Queues at most one auto-reply and returns the
 * recipient ids to send (the webhook sends them right after answering Meta).
 */
export async function queueAutoReply(input: { contactId: string; text: string | null | undefined; at: Date }): Promise<string[]> {
  if (isOptOutMessage(input.text)) return []; // never answer "STOP" with a template

  const live = await db.campaign.findMany({ where: { type: "API", status: "LIVE" } });
  if (!live.length) return [];
  const campaigns = live.map((c) => ({ ...c, trigger: parseTrigger(c.trigger) }));

  const inbound = await db.message.count({
    where: { senderType: "CUSTOMER", conversation: { contactId: input.contactId } },
  });
  const candidates = matchingCampaigns(campaigns, { text: input.text, isFirstMessage: inbound <= 1 });

  for (const campaign of candidates) {
    const { cooldownHours } = campaign.trigger.incoming;
    if (cooldownHours > 0) {
      const recent = await db.campaignRecipient.findFirst({
        where: {
          campaignId: campaign.id,
          contactId: input.contactId,
          createdAt: { gte: new Date(input.at.getTime() - cooldownHours * 3600 * 1000) },
          status: { notIn: ["SKIPPED", "FAILED"] },
        },
      });
      if (recent) continue;
    }
    const recipient = await db.campaignRecipient.create({
      data: { campaignId: campaign.id, contactId: input.contactId, source: "incoming" },
    });
    return [recipient.id];
  }
  return [];
}

// ---------------------------------------------------------------------------
// API trigger: POST /api/v1/campaigns/send
// ---------------------------------------------------------------------------

export const apiSendSchema = z.object({
  /** Campaign id, or its exact name. */
  campaign: z.string().min(1).max(200),
  phone: z.string().min(5).max(30),
  name: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  /** Placeholder values for this message: { "1": "Asha", "code": "482913", "url": "…", "mediaUrl": "https://…" } */
  params: z.record(z.string(), z.union([z.string().max(1000), z.number()])).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
});
export type ApiSendInput = z.infer<typeof apiSendSchema>;

export async function sendViaApi(input: ApiSendInput): Promise<{ recipientId: string; outcome: Outcome }> {
  const campaign: Campaign | null =
    (await db.campaign.findFirst({ where: { id: input.campaign, type: "API" } })) ??
    (await db.campaign.findFirst({ where: { name: input.campaign, type: "API" }, orderBy: { createdAt: "desc" } }));
  if (!campaign) throw new ApiCampaignError(`No API campaign called "${input.campaign}"`);
  if (campaign.status !== "LIVE") throw new ApiCampaignError(`Campaign "${campaign.name}" is paused`);

  const waId = normalizeWaId(input.phone);
  if (!waId) throw new ApiCampaignError("phone must be a full international number, e.g. +919812345678");

  const tags = (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const existing = await db.contact.findUnique({ where: { waId } });
  const contact = existing
    ? await db.contact.update({
        where: { id: existing.id },
        data: {
          name: existing.name ? undefined : input.name?.trim() || undefined,
          email: existing.email ? undefined : input.email?.trim() || undefined,
          tags: tags.length ? [...new Set([...existing.tags, ...tags])] : undefined,
          attributes: input.attributes ? { ...(existing.attributes as object), ...input.attributes } : undefined,
        },
      })
    : await db.contact.create({
        data: { waId, phone: waIdToPhone(waId), name: input.name?.trim() || null, email: input.email?.trim() || null, tags, attributes: input.attributes ?? {} },
      });

  const params = input.params ? Object.fromEntries(Object.entries(input.params).map(([k, v]) => [k, String(v)])) : undefined;
  const recipient = await db.campaignRecipient.create({
    data: { campaignId: campaign.id, contactId: contact.id, source: "api", params },
  });
  return { recipientId: recipient.id, outcome: await sendApiRecipient(recipient.id) };
}

/** Switch an API campaign on or off. */
export async function setApiCampaignLive(id: string, live: boolean): Promise<void> {
  const { count } = await db.campaign.updateMany({
    where: { id, type: "API", status: { in: ["LIVE", "PAUSED"] } },
    data: { status: live ? "LIVE" : "PAUSED", ...(live && { lastError: null }) },
  });
  if (!count) throw new ApiCampaignError("Campaign not found");
}

export async function updateTrigger(id: string, trigger: ApiTrigger): Promise<void> {
  const { count } = await db.campaign.updateMany({ where: { id, type: "API" }, data: { trigger } });
  if (!count) throw new ApiCampaignError("Campaign not found");
}
