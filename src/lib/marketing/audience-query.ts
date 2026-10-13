import { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import { type AudienceFilter, segmentIds, type TextField } from "./audience";
import { type SegmentRules, segmentRulesSchema } from "./segments";

// Broadcast audiences → SQL. Raw SQL rather than Prisma filters so text matches ignore case
// ("dps" finds "DPS") inside custom fields like school and class, which Prisma's JSON filters can't.
// Every value is a bound parameter; only fixed SQL is written inline.

export class AudienceError extends UserError {}

type Client = Pick<typeof db, "$queryRaw" | "segment">;

const { sql, join } = Prisma;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Always true: a WhatsApp number, not blocked, never opted out. */
const BASE = sql`c."waId" IS NOT NULL AND NOT c.blocked AND c."optInStatus" <> 'OPTED_OUT'`;

const textArray = (values: string[]) => sql`ARRAY[${join(values)}]::text[]`;

/** Has written to us on WhatsApp (since a time, or ever). */
function messagedSince(since: Date | null): Prisma.Sql {
  return sql`EXISTS (SELECT 1 FROM "Conversation" v WHERE v."contactId" = c.id AND v.channel = 'WHATSAPP' AND ${
    since ? sql`v."lastInboundAt" >= ${since}` : sql`v."lastInboundAt" IS NOT NULL`
  })`;
}

function textExpression(field: TextField): Prisma.Sql {
  switch (field) {
    case "name":
      return sql`coalesce(c.name, '')`;
    case "first_name":
      return sql`split_part(regexp_replace(btrim(coalesce(c.name, '')), '\\s+', ' ', 'g'), ' ', 1)`;
    case "phone":
      return sql`coalesce(c."waId", '')`;
    case "email":
      return sql`coalesce(c.email, '')`;
    default:
      return sql`coalesce(c.attributes ->> ${field.slice("attr:".length)}, '')`;
  }
}

function textCondition(f: Extract<AudienceFilter, { kind: "text" }>): Prisma.Sql {
  const expr = sql`lower(btrim(${textExpression(f.field)}))`;
  if (f.op === "is_empty") return sql`${expr} = ''`;
  if (f.op === "is_not_empty") return sql`${expr} <> ''`;

  // Phone numbers are stored as digits only ("919812345678").
  const values = f.values.map((v) => (f.field === "phone" ? v.replace(/\D/g, "") : v.trim().toLowerCase())).filter(Boolean);
  if (!values.length) return sql`FALSE`;
  const anyOf = (one: (v: string) => Prisma.Sql) => sql`(${join(values.map(one), " OR ")})`;

  switch (f.op) {
    case "is":
      return sql`${expr} = ANY(${textArray(values)})`;
    case "is_not":
      return sql`NOT (${expr} = ANY(${textArray(values)}))`;
    case "contains":
      return anyOf((v) => sql`strpos(${expr}, ${v}) > 0`);
    case "not_contains":
      return sql`NOT ${anyOf((v) => sql`strpos(${expr}, ${v}) > 0`)}`;
    case "starts_with":
      return anyOf((v) => sql`starts_with(${expr}, ${v})`);
  }
}

/** A saved segment's rules (see ./segments.ts — segments only hold opted-in contacts). */
function segmentCondition(rules: SegmentRules, now: number): Prisma.Sql {
  const daysAgo = (days: number) => new Date(now - days * DAY_MS);
  const and: Prisma.Sql[] = [sql`c."optInStatus" = 'OPTED_IN'`];
  if (rules.tagsAny.length) and.push(sql`c.tags && ${textArray(rules.tagsAny)}`);
  if (rules.tagsAll.length) and.push(sql`c.tags @> ${textArray(rules.tagsAll)}`);
  if (rules.tagsNone.length) and.push(sql`NOT (c.tags && ${textArray(rules.tagsNone)})`);
  if (rules.activeWithinDays) and.push(messagedSince(daysAgo(rules.activeWithinDays)));
  if (rules.inactiveForDays) and.push(sql`NOT ${messagedSince(daysAgo(rules.inactiveForDays))}`);
  if (rules.hasMessagedUs === true) and.push(messagedSince(null));
  if (rules.hasMessagedUs === false) and.push(sql`NOT ${messagedSince(null)}`);
  if (rules.countryCodes.length) and.push(sql`(${join(rules.countryCodes.map((cc) => sql`starts_with(c."waId", ${cc})`), " OR ")})`);
  if (rules.optedInWithinDays) and.push(sql`c."optInAt" >= ${daysAgo(rules.optedInWithinDays)}`);
  return sql`(${join(and, " AND ")})`;
}

function filterCondition(f: AudienceFilter, segments: Map<string, SegmentRules>, now: number): Prisma.Sql {
  const daysAgo = (days: number) => new Date(now - days * DAY_MS);
  switch (f.kind) {
    case "opted_in":
      return f.value ? sql`c."optInStatus" = 'OPTED_IN'` : sql`c."optInStatus" = 'UNKNOWN'`;
    case "messaged_us":
      return f.value ? messagedSince(null) : sql`NOT ${messagedSince(null)}`;
    case "tags": {
      const tags = textArray(f.values.map((t) => t.trim().toLowerCase()));
      if (f.op === "any") return sql`c.tags && ${tags}`;
      if (f.op === "all") return sql`c.tags @> ${tags}`;
      return sql`NOT (c.tags && ${tags})`;
    }
    case "segment": {
      const rules = segments.get(f.segmentId);
      if (!rules) throw new AudienceError("A segment in this audience was deleted. Remove that filter.");
      return f.op === "in" ? segmentCondition(rules, now) : sql`NOT ${segmentCondition(rules, now)}`;
    }
    case "date": {
      const since = f.days ? daysAgo(f.days) : f.date ? new Date(f.date) : new Date(now);
      if (f.field === "created") {
        if (f.op === "within_days" || f.op === "after") return sql`c."createdAt" >= ${since}`;
        return sql`c."createdAt" < ${since}`; // not_within_days | before
      }
      if (f.op === "never") return sql`NOT ${messagedSince(null)}`;
      if (f.op === "within_days" || f.op === "after") return messagedSince(since);
      if (f.op === "not_within_days") return sql`NOT ${messagedSince(since)}`;
      return sql`(${messagedSince(null)} AND NOT ${messagedSince(since)})`; // before: wrote, but not since then
    }
    case "text":
      return textCondition(f);
  }
}

/** The WHERE condition (on "Contact" c) for these filters. */
export async function audienceCondition(filters: AudienceFilter[], now = Date.now(), client: Client = db): Promise<Prisma.Sql> {
  const ids = segmentIds(filters);
  const rows = ids.length ? await client.segment.findMany({ where: { id: { in: ids } } }) : [];
  const segments = new Map(rows.map((s) => [s.id, segmentRulesSchema.parse(s.rules)]));
  return join([BASE, ...filters.map((f) => filterCondition(f, segments, now))], " AND ");
}

export type AudiencePreview = {
  size: number;
  /** Matching contacts who haven't opted in (only when "Opted in is Yes" was removed). */
  notOptedIn: number;
  sample: {
    id: string;
    name: string | null;
    phone: string | null;
    tags: string[];
    attributes: Record<string, unknown>;
    optInStatus: string;
  }[];
};

/** How many contacts match right now, and the newest few. */
export async function previewAudience(filters: AudienceFilter[]): Promise<AudiencePreview> {
  const where = await audienceCondition(filters);
  const [counts, sample] = await Promise.all([
    db.$queryRaw<{ size: number; notOptedIn: number }[]>`
      SELECT count(*)::int AS size, (count(*) FILTER (WHERE c."optInStatus" <> 'OPTED_IN'))::int AS "notOptedIn"
      FROM "Contact" c WHERE ${where}`,
    db.$queryRaw<{ id: string; name: string | null; waId: string; tags: string[]; attributes: Record<string, unknown>; optInStatus: string }[]>`
      SELECT c.id, c.name, c."waId", c.tags, c.attributes, c."optInStatus"::text AS "optInStatus"
      FROM "Contact" c WHERE ${where} ORDER BY c."createdAt" DESC, c.id DESC LIMIT 10`,
  ]);
  return {
    size: counts[0]?.size ?? 0,
    notOptedIn: counts[0]?.notOptedIn ?? 0,
    sample: sample.map((c) => ({ id: c.id, name: c.name, phone: "+" + c.waId, tags: c.tags, attributes: c.attributes ?? {}, optInStatus: c.optInStatus })),
  };
}

/** The next page of matching contact ids, in id order (for snapshotting a campaign's audience). */
export function audiencePage(client: Pick<typeof db, "$queryRaw">, where: Prisma.Sql, after: string | null, take: number) {
  return client.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Contact" c WHERE ${where} ${after ? sql`AND c.id > ${after}` : Prisma.empty}
    ORDER BY c.id LIMIT ${take}`;
}
