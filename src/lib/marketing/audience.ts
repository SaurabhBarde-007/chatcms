import { z } from "zod";
import { fieldLabel } from "../format";

// Who a broadcast goes to: a list of filters, all of which must match ("and").
// Shared by the campaign form (browser) and the server (./audience-query.ts turns them into SQL).
//
// Always true, whatever the filters say: the contact has a WhatsApp number, isn't blocked,
// and hasn't opted out.

export const TEXT_OPS = ["is", "is_not", "contains", "not_contains", "starts_with", "is_empty", "is_not_empty"] as const;
export type TextOp = (typeof TEXT_OPS)[number];
/** Operators that don't need a value. */
export const VALUELESS_OPS: TextOp[] = ["is_empty", "is_not_empty"];

/** name | first_name | phone | email | attr:<custom field> */
export const textFieldSchema = z.union([z.enum(["name", "first_name", "phone", "email"]), z.string().regex(/^attr:[a-z0-9_]{1,50}$/)]);
export type TextField = z.infer<typeof textFieldSchema>;

const values = z.array(z.string().trim().min(1).max(200)).max(100);

export const audienceFilterSchema = z.discriminatedUnion("kind", [
  /** true: opted in. false: not asked yet (people who opted out are never included). */
  z.object({ kind: z.literal("opted_in"), value: z.boolean() }),
  z.object({ kind: z.literal("messaged_us"), value: z.boolean() }),
  z.object({ kind: z.literal("tags"), op: z.enum(["any", "all", "none"]), values: values.min(1) }),
  z.object({ kind: z.literal("segment"), op: z.enum(["in", "not_in"]), segmentId: z.string().min(1).max(50) }),
  z
    .object({
      kind: z.literal("date"),
      field: z.enum(["created", "last_seen"]),
      op: z.enum(["within_days", "not_within_days", "after", "before", "never"]),
      days: z.number().int().min(1).max(3650).optional(),
      /** ISO time (the start of the chosen day, in your time zone). */
      date: z.iso.datetime({ offset: true }).optional(),
    })
    .refine((f) => (f.op === "within_days" || f.op === "not_within_days" ? f.days : f.op === "never" ? f.field === "last_seen" : f.date), {
      message: "Incomplete date filter",
    }),
  z
    .object({ kind: z.literal("text"), field: textFieldSchema, op: z.enum(TEXT_OPS), values: values.default([]) })
    .refine((f) => VALUELESS_OPS.includes(f.op) || f.values.length > 0, { message: "Enter a value to filter by" }),
]);
export type AudienceFilter = z.infer<typeof audienceFilterSchema>;

export const audienceSchema = z.object({ filters: z.array(audienceFilterSchema).max(30) });
export type Audience = z.infer<typeof audienceSchema>;

/** A new broadcast starts with "Opted in is Yes" (and the fixed "Blocked is No"). */
export const DEFAULT_FILTERS: AudienceFilter[] = [{ kind: "opted_in", value: true }];

/**
 * Must every recipient be opted in? Yes unless you removed "Opted in is Yes" — then people who
 * were never asked can be included too (never anyone who opted out). Segments only hold
 * opted-in contacts.
 */
export function requiresOptIn(filters: AudienceFilter[]): boolean {
  return filters.some((f) => (f.kind === "opted_in" && f.value) || (f.kind === "segment" && f.op === "in"));
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const TEXT_LABELS: Record<string, string> = {
  name: "Name",
  first_name: "First name",
  phone: "Mobile number",
  email: "Email",
  "attr:school": "School",
  "attr:class": "Class",
};

export function textFieldLabel(field: TextField): string {
  return TEXT_LABELS[field] ?? fieldLabel(field.slice("attr:".length));
}

export const TEXT_OP_LABELS: Record<TextOp, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "doesn't contain",
  starts_with: "starts with",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

const list = (items: string[], joiner: string) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}`;

const day = (iso: string | undefined) => (iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "");

/** "School is DPS or KV", "Tagged vip", "Last seen in the last 30 days". */
export function describeFilter(f: AudienceFilter, segmentNames: Record<string, string> = {}): string {
  switch (f.kind) {
    case "opted_in":
      return `Opted in is ${f.value ? "Yes" : "No"}`;
    case "messaged_us":
      return f.value ? "Has messaged us" : "Never messaged us";
    case "tags":
      return f.op === "any" ? `Tagged ${list(f.values, "or")}` : f.op === "all" ? `Tagged ${list(f.values, "and")}` : `Not tagged ${list(f.values, "or")}`;
    case "segment":
      return `${f.op === "in" ? "In" : "Not in"} segment ${segmentNames[f.segmentId] ?? "(deleted)"}`;
    case "date": {
      const what = f.field === "created" ? "Added" : "Last seen";
      if (f.op === "never") return "Never messaged us";
      if (f.op === "within_days") return `${what} in the last ${f.days} days`;
      if (f.op === "not_within_days") return `${what} more than ${f.days} days ago${f.field === "last_seen" ? " (or never)" : ""}`;
      return `${what} ${f.op} ${day(f.date)}`;
    }
    case "text": {
      const label = textFieldLabel(f.field);
      if (VALUELESS_OPS.includes(f.op)) return `${label} ${TEXT_OP_LABELS[f.op]}`;
      return `${label} ${TEXT_OP_LABELS[f.op]} ${list(f.values, "or")}`;
    }
  }
}

/** One line for the whole audience, e.g. "Opted in · School is DPS · Class is 10". */
export function describeAudience(filters: AudienceFilter[], segmentNames: Record<string, string> = {}): string {
  const parts = filters.map((f) => (f.kind === "opted_in" && f.value ? "Opted in" : describeFilter(f, segmentNames)));
  return parts.length ? parts.join(" · ") : "Everyone not opted out";
}

/** A campaign's stored audience, or null for older campaigns (segment / all opted-in). */
export function parseAudience(json: unknown): Audience | null {
  const parsed = audienceSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Segment ids a list of filters refers to. */
export function segmentIds(filters: AudienceFilter[]): string[] {
  return [...new Set(filters.flatMap((f) => (f.kind === "segment" ? [f.segmentId] : [])))];
}
