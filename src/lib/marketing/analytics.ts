import { db } from "../db";
import { campaignStats, type CampaignStats, EMPTY_STATS } from "./campaigns";

// Engagement analytics. Days are bucketed in the viewer's time zone.

export type DayPoint = { day: string } & Record<string, number | string>;

export type AnalyticsDTO = {
  range: { days: number; from: string; to: string; timeZone: string };
  inbox: {
    totals: {
      received: number;
      sentByYou: number;
      activeContacts: number;
      newContacts: number;
      /** Median minutes from a customer's message to your reply (null if no replies). */
      medianResponseMinutes: number | null;
      p90ResponseMinutes: number | null;
      /** Share of your replies that were read (0–1, null if none). */
      readRate: number | null;
    };
    daily: { day: string; received: number; sentByYou: number; campaign: number }[];
  };
  campaigns: {
    totals: CampaignStats;
    recent: { id: string; name: string; status: string; startedAt: string | null; stats: CampaignStats }[];
  };
  audience: {
    totals: { optedIn: number; optedOut: number; unknown: number; total: number };
    daily: { day: string; optIns: number; optOuts: number }[];
    sources: { source: string; count: number }[];
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getAnalytics(days: number, timeZone: string): Promise<AnalyticsDTO> {
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);

  const [daily, inboxTotals, response, readRate, campaignsInRange, audienceTotals, audienceDaily, sources] =
    await Promise.all([
      // Messages per day, by who sent them
      db.$queryRaw<{ day: string; received: number; sentByYou: number; campaign: number }[]>`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
          COUNT(m.id) FILTER (WHERE m."senderType" = 'CUSTOMER')::int AS received,
          COUNT(m.id) FILTER (WHERE m."senderType" = 'HUMAN')::int AS "sentByYou",
          COUNT(m.id) FILTER (WHERE m."senderType" = 'CAMPAIGN' AND m.status <> 'FAILED')::int AS campaign
        FROM generate_series(
          date_trunc('day', ${from}::timestamptz AT TIME ZONE ${timeZone}),
          date_trunc('day', ${to}::timestamptz AT TIME ZONE ${timeZone}),
          interval '1 day') AS d(day)
        LEFT JOIN "Message" m
          ON date_trunc('day', m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}) = d.day
         AND m."createdAt" >= ${from}
        GROUP BY d.day ORDER BY d.day`,

      db.$queryRaw<[{ received: number; sentByYou: number; activeContacts: number; newContacts: number }]>`
        SELECT
          (SELECT COUNT(*) FROM "Message" WHERE "senderType" = 'CUSTOMER' AND "createdAt" >= ${from})::int AS received,
          (SELECT COUNT(*) FROM "Message" WHERE "senderType" = 'HUMAN' AND "createdAt" >= ${from})::int AS "sentByYou",
          (SELECT COUNT(DISTINCT c."contactId") FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
            WHERE m."senderType" = 'CUSTOMER' AND m."createdAt" >= ${from})::int AS "activeContacts",
          (SELECT COUNT(*) FROM "Contact" WHERE "createdAt" >= ${from})::int AS "newContacts"`,

      // Response time: from the first customer message after one of ours (a "turn")
      // to your next reply in that conversation.
      db.$queryRaw<[{ median: number | null; p90: number | null }]>`
        WITH ordered AS (
          SELECT id, "conversationId", "createdAt", "senderType",
            LAG("senderType") OVER (PARTITION BY "conversationId" ORDER BY "createdAt") AS prev
          FROM "Message" WHERE "createdAt" >= ${from}
        ),
        turns AS (
          SELECT o."createdAt" AS asked_at,
            (SELECT MIN(r."createdAt") FROM "Message" r
              WHERE r."conversationId" = o."conversationId" AND r."senderType" = 'HUMAN' AND r."createdAt" > o."createdAt") AS answered_at
          FROM ordered o
          WHERE o."senderType" = 'CUSTOMER' AND (o.prev IS NULL OR o.prev <> 'CUSTOMER')
        )
        SELECT
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM answered_at - asked_at) / 60) AS median,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM answered_at - asked_at) / 60) AS p90
        FROM turns WHERE answered_at IS NOT NULL`,

      db.$queryRaw<[{ rate: number | null }]>`
        SELECT (COUNT(*) FILTER (WHERE status = 'READ')::float / NULLIF(COUNT(*) FILTER (WHERE status IN ('SENT', 'DELIVERED', 'READ')), 0)) AS rate
        FROM "Message" WHERE "senderType" = 'HUMAN' AND "createdAt" >= ${from}`,

      db.campaign.findMany({
        where: { OR: [{ startedAt: { gte: from } }, { status: { in: ["SENDING", "SCHEDULED"] } }] },
        orderBy: [{ startedAt: { sort: "desc", nulls: "first" } }],
        take: 20,
        select: { id: true, name: true, status: true, startedAt: true },
      }),

      db.contact.groupBy({ by: ["optInStatus"], _count: { _all: true } }),

      db.$queryRaw<{ day: string; optIns: number; optOuts: number }[]>`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
          COUNT(e.id) FILTER (WHERE e.status = 'OPTED_IN')::int AS "optIns",
          COUNT(e.id) FILTER (WHERE e.status = 'OPTED_OUT')::int AS "optOuts"
        FROM generate_series(
          date_trunc('day', ${from}::timestamptz AT TIME ZONE ${timeZone}),
          date_trunc('day', ${to}::timestamptz AT TIME ZONE ${timeZone}),
          interval '1 day') AS d(day)
        LEFT JOIN "ConsentEvent" e
          ON date_trunc('day', e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}) = d.day
         AND e."createdAt" >= ${from}
        GROUP BY d.day ORDER BY d.day`,

      db.$queryRaw<{ source: string; count: number }[]>`
        SELECT COALESCE("optInSource", 'unknown') AS source, COUNT(*)::int AS count
        FROM "Contact" WHERE "optInStatus" = 'OPTED_IN' GROUP BY 1 ORDER BY count DESC`,
    ]);

  const stats = await campaignStats(campaignsInRange.map((c) => c.id));
  const totals: CampaignStats = { ...EMPTY_STATS };
  for (const s of stats.values()) for (const k of Object.keys(totals) as (keyof CampaignStats)[]) totals[k] += s[k];

  const count = (status: string) => audienceTotals.find((r) => r.optInStatus === status)?._count._all ?? 0;
  const round = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

  return {
    range: { days, from: from.toISOString(), to: to.toISOString(), timeZone },
    inbox: {
      totals: {
        ...inboxTotals[0],
        medianResponseMinutes: round(response[0]?.median),
        p90ResponseMinutes: round(response[0]?.p90),
        readRate: readRate[0]?.rate ?? null,
      },
      daily,
    },
    campaigns: {
      totals,
      recent: campaignsInRange.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        startedAt: c.startedAt?.toISOString() ?? null,
        stats: stats.get(c.id) ?? EMPTY_STATS,
      })),
    },
    audience: {
      totals: {
        optedIn: count("OPTED_IN"),
        optedOut: count("OPTED_OUT"),
        unknown: count("UNKNOWN"),
        total: audienceTotals.reduce((sum, r) => sum + r._count._all, 0),
      },
      daily: audienceDaily,
      sources,
    },
  };
}
