import type { Campaign, CampaignStatus, CampaignType, Prisma, RecipientStatus } from "@/generated/prisma/client";
import { listTemplates } from "../channels/whatsapp";
import { db } from "../db";
import { UserError } from "../errors";
import { isRazorpayConfigured } from "../payments/razorpay";
import { getSetting, type Pricing } from "../settings";
import { type ApiTrigger, parseTrigger } from "./api-trigger";
import { REACHABLE, segmentRulesSchema, segmentWhere } from "./segments";
import { missingVariables, paymentSources, renderTemplateText, type Template, type TemplateVariables, usesApiValues } from "./templates";

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
  /** Payment links paid (campaigns with a "Payment link" value). */
  paid: number;
  /** Amount collected, in paise. */
  revenue: number;
};

export type CampaignDTO = {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  templateName: string;
  templateLanguage: string;
  templateCategory: string | null;
  segment: { id: string; name: string } | null;
  trigger: ApiTrigger | null;
  audienceSize: number | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  stats: CampaignStats;
  /** What WhatsApp charges for the delivered messages (estimate, Settings → message rates). */
  estimatedCost: number;
  currency: string;
};

export type CampaignDetailDTO = CampaignDTO & {
  template: Template;
  variables: TemplateVariables;
  preview: string;
  usesPaymentLinks: boolean;
  failureReasons: { code: number | null; error: string; count: number }[];
  buttonTaps: { text: string; count: number }[];
};

export const EMPTY_STATS: CampaignStats = {
  total: 0, pending: 0, sent: 0, delivered: 0, read: 0, replied: 0, clicked: 0, failed: 0, skipped: 0, optedOut: 0, paid: 0, revenue: 0,
};

export async function campaignStats(ids: string[]): Promise<Map<string, CampaignStats>> {
  if (!ids.length) return new Map();
  const [rows, payments] = await Promise.all([
    db.$queryRaw<(Omit<CampaignStats, "paid" | "revenue"> & { campaignId: string })[]>`
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
      GROUP BY "campaignId"`,
    db.paymentRequest.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: ids }, status: { in: ["PAID", "PARTIALLY_PAID"] } },
      _count: { _all: true },
      _sum: { amountPaid: true },
    }),
  ]);
  const paid = new Map(payments.map((p) => [p.campaignId, p]));
  return new Map(
    rows.map(({ campaignId, ...stats }) => [
      campaignId,
      { ...stats, paid: paid.get(campaignId)?._count._all ?? 0, revenue: paid.get(campaignId)?._sum.amountPaid ?? 0 },
    ]),
  );
}

/** WhatsApp charges per delivered message, by template category. */
export function estimateCost(delivered: number, category: string | null, pricing: Pricing): number {
  const rate = pricing[(category ?? "MARKETING") as keyof Omit<Pricing, "currency">] ?? pricing.MARKETING;
  return Math.round(delivered * rate * 1000) / 1000;
}

type CampaignWithSegment = Campaign & { segment: { id: string; name: string } | null };

function toDTO(c: CampaignWithSegment, stats: CampaignStats | undefined, pricing: Pricing): CampaignDTO {
  const s = stats ?? EMPTY_STATS;
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    templateName: c.templateName,
    templateLanguage: c.templateLanguage,
    templateCategory: c.templateCategory,
    segment: c.segment ? { id: c.segment.id, name: c.segment.name } : null,
    trigger: c.type === "API" ? parseTrigger(c.trigger) : null,
    audienceSize: c.type === "API" ? s.total : c.audienceSize,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    lastError: c.lastError,
    createdAt: c.createdAt.toISOString(),
    stats: s,
    estimatedCost: estimateCost(s.delivered, c.templateCategory, pricing),
    currency: pricing.currency,
  };
}

export async function listCampaigns(): Promise<CampaignDTO[]> {
  const [campaigns, pricing] = await Promise.all([
    db.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 500, include: { segment: { select: { id: true, name: true } } } }),
    getSetting("pricing"),
  ]);
  const stats = await campaignStats(campaigns.map((c) => c.id));
  return campaigns.map((c) => toDTO(c, stats.get(c.id), pricing));
}

/** Used for previews: fields show as e.g. "Asha", attributes as their fallback. */
export const SAMPLE_CONTACT = { name: "Asha Sharma", email: "asha@example.com", waId: "919812345678", attributes: {} };

export async function getCampaign(id: string): Promise<CampaignDetailDTO | null> {
  const c = await db.campaign.findUnique({ where: { id }, include: { segment: { select: { id: true, name: true } } } });
  if (!c) return null;

  const [stats, failureReasons, buttonTaps, pricing] = await Promise.all([
    campaignStats([id]),
    db.$queryRaw<{ code: number | null; error: string; count: number }[]>`
      SELECT "errorCode" AS code, COALESCE(error, 'Unknown error') AS error, COUNT(*)::int AS count
      FROM "CampaignRecipient" WHERE "campaignId" = ${id} AND status IN ('FAILED', 'SKIPPED')
      GROUP BY 1, 2 ORDER BY count DESC LIMIT 10`,
    db.$queryRaw<{ text: string; count: number }[]>`
      SELECT "buttonText" AS text, COUNT(*)::int AS count
      FROM "CampaignRecipient" WHERE "campaignId" = ${id} AND "buttonAt" IS NOT NULL
      GROUP BY 1 ORDER BY count DESC`,
    getSetting("pricing"),
  ]);

  const template = c.template as unknown as Template;
  const variables = c.variables as unknown as TemplateVariables;
  return {
    ...toDTO(c, stats.get(id), pricing),
    template,
    variables,
    preview: renderTemplateText(template, variables, SAMPLE_CONTACT),
    usesPaymentLinks: paymentSources(template, variables).length > 0,
    failureReasons,
    buttonTaps,
  };
}

/** Messages per day for one campaign (sent / read / replied), in the viewer's time zone. */
export async function campaignDaily(id: string, timeZone: string) {
  return db.$queryRaw<{ day: string; sent: number; read: number; replied: number }[]>`
    WITH days AS (
      SELECT to_char(date_trunc('day', "sentAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS sent, COUNT("readAt")::int AS read, COUNT("repliedAt")::int AS replied
      FROM "CampaignRecipient" WHERE "campaignId" = ${id} AND "sentAt" IS NOT NULL
      GROUP BY 1
    )
    SELECT * FROM days ORDER BY day`;
}

// ---------------------------------------------------------------------------
// Recipients, by funnel stage
// ---------------------------------------------------------------------------

export const STAGES = ["all", "sent", "delivered", "read", "replied", "clicked", "failed", "pending", "paid"] as const;
export type Stage = (typeof STAGES)[number];

function stageWhere(campaignId: string, stage: Stage): Prisma.CampaignRecipientWhereInput {
  switch (stage) {
    case "sent":
      return { campaignId, sentAt: { not: null } };
    case "delivered":
      return { campaignId, deliveredAt: { not: null } };
    case "read":
      return { campaignId, readAt: { not: null } };
    case "replied":
      return { campaignId, repliedAt: { not: null } };
    case "clicked":
      return { campaignId, buttonAt: { not: null } };
    case "failed":
      return { campaignId, status: { in: ["FAILED", "SKIPPED"] } };
    case "pending":
      return { campaignId, status: { in: ["PENDING", "SENDING"] } };
    case "paid":
      return { campaignId, paymentRequest: { status: { in: ["PAID", "PARTIALLY_PAID"] } } };
    default:
      return { campaignId };
  }
}

export type RecipientDTO = {
  id: string;
  contactId: string;
  name: string | null;
  phone: string | null;
  status: RecipientStatus;
  source: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  buttonText: string | null;
  payment: { status: string; amount: number; amountPaid: number; shortUrl: string | null } | null;
};

const recipientInclude = {
  contact: { select: { name: true, waId: true } },
  paymentRequest: { select: { status: true, amount: true, amountPaid: true, shortUrl: true } },
} as const;

function toRecipientDTO(r: Prisma.CampaignRecipientGetPayload<{ include: typeof recipientInclude }>): RecipientDTO {
  return {
    id: r.id,
    contactId: r.contactId,
    name: r.contact.name,
    phone: r.contact.waId ? "+" + r.contact.waId : null,
    status: r.status,
    source: r.source,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    readAt: r.readAt?.toISOString() ?? null,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    buttonText: r.buttonText,
    payment: r.paymentRequest,
  };
}

export async function listRecipients(campaignId: string, stage: Stage = "all", cursor?: string) {
  const rows = await db.campaignRecipient.findMany({
    where: stageWhere(campaignId, stage),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    include: recipientInclude,
  });
  const page = rows.slice(0, 50);
  return { recipients: page.map(toRecipientDTO), nextCursor: rows.length > 50 ? page[page.length - 1].id : null };
}

/** Every recipient at a stage (for CSV export), up to 100k. */
export async function allRecipients(campaignId: string, stage: Stage = "all"): Promise<RecipientDTO[]> {
  const rows = await db.campaignRecipient.findMany({
    where: stageWhere(campaignId, stage),
    orderBy: { createdAt: "asc" },
    take: 100_000,
    include: recipientInclude,
  });
  return rows.map(toRecipientDTO);
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

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
} & (
  | { type: "BROADCAST"; segmentId: string | null; /** null = send now */ scheduledAt: Date | null }
  | { type: "API"; trigger: ApiTrigger; live: boolean }
);

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignDTO> {
  const template = (await listTemplates()).find((t) => t.name === input.templateName && t.language === input.templateLanguage);
  if (!template) throw new CampaignError("That template isn't approved (or no longer exists) in WhatsApp Manager.");
  if (template.unsupported) throw new CampaignError(template.unsupported);

  const missing = missingVariables(template, input.variables);
  if (missing.length) throw new CampaignError(`Fill in: ${missing.join(", ")}`);
  if (paymentSources(template, input.variables).length && !isRazorpayConfigured()) {
    throw new CampaignError("Payment links need Razorpay: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first.");
  }
  if (input.type === "BROADCAST" && template.category === "AUTHENTICATION") {
    throw new CampaignError("Authentication (OTP) templates are sent one person at a time. Use an API campaign.");
  }
  if (usesApiValues(input.variables) && (input.type === "BROADCAST" || input.trigger.incoming.enabled)) {
    throw new CampaignError(
      input.type === "BROADCAST"
        ? "\"From each API call\" values only work in API campaigns."
        : "Auto-replies can't use \"From each API call\" values. Nothing provides them. Turn off the auto-reply, or use another value.",
    );
  }

  const now = new Date();
  const common = {
    name: input.name.trim(),
    type: input.type,
    templateName: template.name,
    templateLanguage: template.language,
    templateCategory: template.category || null,
    template: template as object,
    variables: input.variables as object,
  };

  let campaign;
  if (input.type === "BROADCAST") {
    if (input.segmentId && !(await db.segment.findUnique({ where: { id: input.segmentId } }))) throw new CampaignError("Segment not found");
    if (input.scheduledAt && input.scheduledAt.getTime() < now.getTime() - 60_000) throw new CampaignError("The scheduled time is in the past.");
    campaign = await db.campaign.create({
      data: { ...common, status: "SCHEDULED", segmentId: input.segmentId, scheduledAt: input.scheduledAt ?? now },
      include: { segment: { select: { id: true, name: true } } },
    });
  } else {
    if (input.trigger.incoming.enabled && input.trigger.incoming.match === "KEYWORDS" && !input.trigger.incoming.keywords.length) {
      throw new CampaignError("Add at least one keyword (or choose another trigger)");
    }
    campaign = await db.campaign.create({
      data: { ...common, status: input.live ? "LIVE" : "PAUSED", trigger: input.trigger, startedAt: now },
      include: { segment: { select: { id: true, name: true } } },
    });
  }
  return toDTO(campaign, undefined, await getSetting("pricing"));
}

/** Stop a scheduled or sending broadcast. Messages already sent stay sent. */
export async function cancelCampaign(id: string) {
  const { count } = await db.campaign.updateMany({
    where: { id, type: "BROADCAST", status: { in: ["SCHEDULED", "SENDING"] } },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  if (!count) throw new CampaignError("Only scheduled or sending broadcasts can be cancelled.");
  await db.campaignRecipient.updateMany({ where: { campaignId: id, status: "PENDING" }, data: { status: "SKIPPED", error: "Campaign cancelled" } });
}

// ---------------------------------------------------------------------------
// CSV reports
// ---------------------------------------------------------------------------

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote when needed; neutralise spreadsheet formulas.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
