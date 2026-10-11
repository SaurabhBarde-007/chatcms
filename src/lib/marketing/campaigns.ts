import type { Campaign, CampaignStatus, RecipientStatus } from "@/generated/prisma/client";
import { listTemplates } from "../channels/whatsapp";
import { db } from "../db";
import { UserError } from "../errors";
import { REACHABLE, segmentRulesSchema, segmentWhere } from "./segments";
import { missingVariables, renderTemplateText, type Template, type TemplateVariables } from "./templates";

// Campaigns as the dashboard sees them. Sending itself is in ./campaign-runner.ts.

export class CampaignError extends UserError {}

export type CampaignStats = {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  clicked: number;
  failed: number;
  skipped: number;
  optedOut: number;
};

export type CampaignDTO = {
  id: string;
  name: string;
  status: CampaignStatus;
  templateName: string;
  templateLanguage: string;
  templateCategory: string | null;
  segment: { id: string; name: string } | null;
  audienceSize: number | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  stats: CampaignStats;
};

export type CampaignDetailDTO = CampaignDTO & {
  template: Template;
  variables: TemplateVariables;
  preview: string;
  failureReasons: { code: number | null; error: string; count: number }[];
  buttonTaps: { text: string; count: number }[];
};

export const EMPTY_STATS: CampaignStats = {
  total: 0, pending: 0, sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, failed: 0, skipped: 0, optedOut: 0,
};

export async function campaignStats(ids: string[]): Promise<Map<string, CampaignStats>> {
  if (!ids.length) return new Map();
  const rows = await db.$queryRaw<(CampaignStats & { campaignId: string })[]>`
    SELECT "campaignId",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status IN ('PENDING', 'SENDING'))::int AS pending,
      COUNT("sentAt")::int AS sent,
      COUNT("deliveredAt")::int AS delivered,
      COUNT("readAt")::int AS read,
      COUNT("repliedAt")::int AS replied,
      COUNT("buttonAt")::int AS clicked,
      COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'SKIPPED')::int AS skipped,
      COUNT("optedOutAt")::int AS "optedOut"
    FROM "CampaignRecipient"
    WHERE "campaignId" = ANY(${ids})
    GROUP BY "campaignId"`;
  return new Map(rows.map(({ campaignId, ...stats }) => [campaignId, stats]));
}

type CampaignWithSegment = Campaign & { segment: { id: string; name: string } | null };

function toDTO(c: CampaignWithSegment, stats: CampaignStats | undefined): CampaignDTO {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    templateName: c.templateName,
    templateLanguage: c.templateLanguage,
    templateCategory: c.templateCategory,
    segment: c.segment ? { id: c.segment.id, name: c.segment.name } : null,
    audienceSize: c.audienceSize,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    lastError: c.lastError,
    createdAt: c.createdAt.toISOString(),
    stats: stats ?? EMPTY_STATS,
  };
}

export async function listCampaigns(): Promise<CampaignDTO[]> {
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { segment: { select: { id: true, name: true } } },
  });
  const stats = await campaignStats(campaigns.map((c) => c.id));
  return campaigns.map((c) => toDTO(c, stats.get(c.id)));
}

export async function getCampaign(id: string): Promise<CampaignDetailDTO | null> {
  const c = await db.campaign.findUnique({ where: { id }, include: { segment: { select: { id: true, name: true } } } });
  if (!c) return null;

  const [stats, failureReasons, buttonTaps] = await Promise.all([
    campaignStats([id]),
    db.$queryRaw<{ code: number | null; error: string; count: number }[]>`
      SELECT "errorCode" AS code, COALESCE(error, 'Unknown error') AS error, COUNT(*)::int AS count
      FROM "CampaignRecipient" WHERE "campaignId" = ${id} AND status IN ('FAILED', 'SKIPPED')
      GROUP BY 1, 2 ORDER BY count DESC LIMIT 10`,
    db.$queryRaw<{ text: string; count: number }[]>`
      SELECT "buttonText" AS text, COUNT(*)::int AS count
      FROM "CampaignRecipient" WHERE "campaignId" = ${id} AND "buttonAt" IS NOT NULL
      GROUP BY 1 ORDER BY count DESC`,
  ]);

  const template = c.template as unknown as Template;
  const variables = c.variables as unknown as TemplateVariables;
  return {
    ...toDTO(c, stats.get(id)),
    template,
    variables,
    preview: renderTemplateText(template, variables, SAMPLE_CONTACT),
    failureReasons,
    buttonTaps,
  };
}

/** Used for previews: fields show as e.g. "Asha", attributes as their fallback. */
export const SAMPLE_CONTACT = { name: "Asha Sharma", email: "asha@example.com", waId: "919812345678", attributes: {} };

export type RecipientDTO = {
  id: string;
  contactId: string;
  name: string | null;
  phone: string | null;
  status: RecipientStatus;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  buttonText: string | null;
};

export async function listRecipients(campaignId: string, status?: RecipientStatus, cursor?: string) {
  const rows = await db.campaignRecipient.findMany({
    where: { campaignId, status },
    orderBy: { id: "asc" },
    take: 51,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: { contact: { select: { name: true, waId: true } } },
  });
  const page = rows.slice(0, 50);
  return {
    recipients: page.map(
      (r): RecipientDTO => ({
        id: r.id,
        contactId: r.contactId,
        name: r.contact.name,
        phone: r.contact.waId ? "+" + r.contact.waId : null,
        status: r.status,
        error: r.error,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
        readAt: r.readAt?.toISOString() ?? null,
        repliedAt: r.repliedAt?.toISOString() ?? null,
        buttonText: r.buttonText,
      }),
    ),
    nextCursor: rows.length > 50 ? page[page.length - 1].id : null,
  };
}

/** How many contacts a campaign to this segment (or everyone opted in) would reach right now. */
export async function audienceSize(segmentId: string | null): Promise<number> {
  if (!segmentId) return db.contact.count({ where: REACHABLE });
  const segment = await db.segment.findUnique({ where: { id: segmentId } });
  if (!segment) throw new CampaignError("Segment not found");
  return db.contact.count({ where: segmentWhere(segmentRulesSchema.parse(segment.rules)) });
}

export type CreateCampaignInput = {
  name: string;
  templateName: string;
  templateLanguage: string;
  variables: TemplateVariables;
  segmentId: string | null;
  /** null = send now */
  scheduledAt: Date | null;
};

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignDTO> {
  const template = (await listTemplates()).find(
    (t) => t.name === input.templateName && t.language === input.templateLanguage,
  );
  if (!template) throw new CampaignError("That template isn't approved (or no longer exists) in WhatsApp Manager.");
  if (template.unsupported) throw new CampaignError(template.unsupported);

  const missing = missingVariables(template, input.variables);
  if (missing.length) throw new CampaignError(`Fill in: ${missing.join(", ")}`);

  if (input.segmentId && !(await db.segment.findUnique({ where: { id: input.segmentId } }))) {
    throw new CampaignError("Segment not found");
  }

  const now = new Date();
  if (input.scheduledAt && input.scheduledAt.getTime() < now.getTime() - 60_000) {
    throw new CampaignError("The scheduled time is in the past.");
  }

  const campaign = await db.campaign.create({
    data: {
      name: input.name.trim(),
      status: "SCHEDULED",
      templateName: template.name,
      templateLanguage: template.language,
      templateCategory: template.category || null,
      template: template as object,
      variables: input.variables as object,
      segmentId: input.segmentId,
      scheduledAt: input.scheduledAt ?? now,
    },
    include: { segment: { select: { id: true, name: true } } },
  });
  return toDTO(campaign, undefined);
}

/** Stop a scheduled or sending campaign. Messages already sent stay sent. */
export async function cancelCampaign(id: string) {
  const { count } = await db.campaign.updateMany({
    where: { id, status: { in: ["SCHEDULED", "SENDING"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  if (!count) throw new CampaignError("Only scheduled or sending campaigns can be cancelled.");
  await db.campaignRecipient.updateMany({
    where: { campaignId: id, status: "PENDING" },
    data: { status: "SKIPPED", error: "Campaign cancelled" },
  });
}
