import { type OptInStatus, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { UserError } from "../errors";
import { publish } from "../realtime/publish";
import { setConsent } from "./consent";
import { type ImportProblem, type ImportRow, normalizeHeader } from "./csv";
import { normalizeWaId, waIdToPhone } from "./phone";

// Contacts as a marketing audience: list/filter, edit tags and consent, import, opt-in API.

export class ContactError extends UserError {}

export type ContactRowDTO = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  waId: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  optInStatus: OptInStatus;
  optInSource: string | null;
  optInAt: string | null;
  optOutAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
};

export type ContactFilters = {
  q?: string;
  status?: OptInStatus;
  tag?: string;
  cursor?: string;
};

const PAGE_SIZE = 50;

function contactWhere(f: ContactFilters): Prisma.ContactWhereInput {
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "");
  return {
    optInStatus: f.status,
    ...(f.tag && { tags: { has: f.tag } }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits && digits.length >= 3 ? [{ waId: { contains: digits } }] : []),
      ],
    }),
  };
}

export async function listContacts(f: ContactFilters) {
  const where = contactWhere(f);
  const [rows, total] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(f.cursor && { cursor: { id: f.cursor }, skip: 1 }),
      include: {
        conversations: {
          where: { lastInboundAt: { not: null } },
          orderBy: { lastInboundAt: "desc" },
          take: 1,
          select: { lastInboundAt: true },
        },
      },
    }),
    db.contact.count({ where }),
  ]);

  const page = rows.slice(0, PAGE_SIZE);
  return {
    contacts: page.map((c) => toContactRow(c, c.conversations[0]?.lastInboundAt ?? null)),
    total,
    nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
  };
}

function toContactRow(c: Prisma.ContactGetPayload<object>, lastActiveAt: Date | null): ContactRowDTO {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? (c.waId ? waIdToPhone(c.waId) : null),
    email: c.email,
    waId: c.waId,
    tags: c.tags,
    attributes: (c.attributes ?? {}) as Record<string, unknown>,
    optInStatus: c.optInStatus,
    optInSource: c.optInSource,
    optInAt: c.optInAt?.toISOString() ?? null,
    optOutAt: c.optOutAt?.toISOString() ?? null,
    lastActiveAt: lastActiveAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed email, or null; throws if it can't be an address. */
function cleanEmail(email: string | null | undefined): string | null {
  const value = email?.trim();
  if (!value) return null;
  if (!EMAIL.test(value)) throw new ContactError(`"${value}" doesn't look like an email address`);
  return value;
}

/** Custom field names as stored: "Parent Name" → "parent_name". Empty values are dropped. */
function cleanAttributes(attributes: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    const k = normalizeHeader(key);
    if (k && value?.trim()) out[k] = value.trim();
  }
  return out;
}

const cleanTags = (tags: string[] | undefined) => [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];

export type NewContact = {
  phone: string;
  /** Added to numbers typed without "+", e.g. "91". */
  defaultCountryCode?: string;
  name?: string;
  email?: string;
  tags?: string[];
  /** Custom fields, incl. school and class. */
  attributes?: Record<string, string>;
  /** They agreed to receive marketing messages. */
  optedIn?: boolean;
};

/** Add one contact by hand. Fails if the number is already a contact. */
export async function createContact(input: NewContact): Promise<ContactRowDTO> {
  const waId = normalizeWaId(input.phone, input.defaultCountryCode);
  if (!waId) throw new ContactError(`"${input.phone}" isn't a valid phone number. Include the country code, e.g. +91 98123 45678`);
  const email = cleanEmail(input.email);

  const duplicate = async () => {
    const existing = await db.contact.findUnique({ where: { waId } });
    return existing
      ? new ContactError(`${waIdToPhone(waId)} is already in your contacts${existing.name ? ` as ${existing.name}` : ""}`)
      : null;
  };
  const known = await duplicate();
  if (known) throw known;

  try {
    const id = await db.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          waId,
          phone: waIdToPhone(waId),
          name: input.name?.trim() || null,
          email,
          tags: cleanTags(input.tags),
          attributes: cleanAttributes(input.attributes),
        },
      });
      if (input.optedIn) await setConsent(contact.id, "OPTED_IN", "manual", tx);
      return contact.id;
    });
    return toContactRow(await db.contact.findUniqueOrThrow({ where: { id } }), null);
  } catch (err) {
    // Someone else added the same number at the same moment.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw (await duplicate()) ?? err;
    throw err;
  }
}

/** Every tag in use, with how many contacts have it. */
export async function listTags(): Promise<{ tag: string; count: number }[]> {
  const rows = await db.$queryRaw<{ tag: string; count: number }[]>`
    SELECT tag, COUNT(*)::int AS count FROM "Contact", unnest(tags) AS tag GROUP BY tag ORDER BY count DESC, tag`;
  return rows;
}

/** Every custom field name in use (for template personalization). */
export async function listAttributeKeys(): Promise<string[]> {
  const rows = await db.$queryRaw<{ key: string }[]>`
    SELECT DISTINCT jsonb_object_keys(attributes) AS key FROM "Contact" ORDER BY key LIMIT 200`;
  return rows.map((r) => r.key);
}

/** Top-level `school` / `class` (opt-in and campaign APIs) are stored as custom fields. */
export function profileAttributes(input: { attributes?: Record<string, string>; school?: string; class?: string }) {
  const attributes = { ...input.attributes };
  for (const key of ["school", "class"] as const) {
    const value = input[key]?.trim();
    if (value) attributes[key] = value;
  }
  return Object.keys(attributes).length ? attributes : undefined;
}

export async function updateContact(
  id: string,
  input: {
    name?: string | null;
    email?: string | null;
    tags?: string[];
    optInStatus?: "OPTED_IN" | "OPTED_OUT";
    /** Custom fields to set; null or "" removes one. Others are kept. */
    attributes?: Record<string, string | null>;
  },
) {
  const contact = await db.contact.findUnique({ where: { id }, include: { conversations: { select: { id: true } } } });
  if (!contact) throw new ContactError("Contact not found");

  const email = input.email !== undefined ? cleanEmail(input.email) : undefined;
  let attributes: Record<string, unknown> | undefined;
  if (input.attributes) {
    attributes = { ...(contact.attributes as Record<string, unknown>) };
    for (const [key, value] of Object.entries(input.attributes)) {
      const k = normalizeHeader(key);
      if (!k) continue;
      if (value?.trim()) attributes[k] = value.trim();
      else delete attributes[k];
    }
  }

  await db.$transaction(async (tx) => {
    await tx.contact.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name?.trim() || null }),
        ...(email !== undefined && { email }),
        ...(input.tags && { tags: cleanTags(input.tags) }),
        ...(attributes && { attributes: attributes as Prisma.InputJsonObject }),
      },
    });
    if (input.optInStatus) await setConsent(id, input.optInStatus, "manual", tx);
  });
  // Open inboxes show the contact's details next to the chat.
  await Promise.all(contact.conversations.map((c) => publish({ kind: "conversation", id: c.id })));
}

// ---------------------------------------------------------------------------
// Opt-in API (your website / forms)
// ---------------------------------------------------------------------------

export type OptInRequest = {
  phone: string;
  name?: string;
  email?: string;
  tags?: string[];
  attributes?: Record<string, string>;
  school?: string;
  class?: string;
  /** false records an opt-out instead. Default true. */
  optedIn?: boolean;
};

export async function upsertFromOptInApi(input: OptInRequest): Promise<{ contactId: string; created: boolean }> {
  const waId = normalizeWaId(input.phone);
  if (!waId) throw new ContactError("phone must be a full international number, e.g. +919812345678");

  const existing = await db.contact.findUnique({ where: { waId } });
  const tags = (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const attributes = profileAttributes(input);

  return db.$transaction(async (tx) => {
    const contact = existing
      ? await tx.contact.update({
          where: { id: existing.id },
          data: {
            name: input.name?.trim() || undefined,
            email: input.email?.trim() || undefined,
            tags: [...new Set([...existing.tags, ...tags])],
            attributes: { ...(existing.attributes as object), ...attributes },
          },
        })
      : await tx.contact.create({
          data: {
            waId,
            phone: waIdToPhone(waId),
            name: input.name?.trim() || null,
            email: input.email?.trim() || null,
            tags,
            attributes: attributes ?? {},
          },
        });
    await setConsent(contact.id, input.optedIn === false ? "OPTED_OUT" : "OPTED_IN", "api", tx);
    return { contactId: contact.id, created: !existing };
  });
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export type ImportSummary = {
  created: number;
  updated: number;
  optedIn: number;
  optedOut: number;
  /** Marked opted in by the file, but they had opted out (e.g. replied STOP) — left opted out. */
  keptOptedOut: number;
  problems: ImportProblem[];
};

const CHUNK = 500;

/**
 * Create or update contacts by phone number. CSV values for name/email overwrite ours;
 * tags are added; custom fields are merged.
 * `allOptedIn`: you confirmed everyone in the file opted in (used where the file has no opt-in column).
 */
export async function importContacts(
  rows: ImportRow[],
  problems: ImportProblem[],
  options: { allOptedIn: boolean },
): Promise<ImportSummary> {
  const summary: ImportSummary = { created: 0, updated: 0, optedIn: 0, optedOut: 0, keptOptedOut: 0, problems };

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.$transaction(
      async (tx) => {
        const existing = await tx.contact.findMany({ where: { waId: { in: chunk.map((r) => r.waId) } } });
        const byWaId = new Map(existing.map((c) => [c.waId!, c]));

        const toCreate = chunk.filter((r) => !byWaId.has(r.waId));
        const created = await tx.contact.createManyAndReturn({
          data: toCreate.map((r) => ({
            waId: r.waId,
            phone: waIdToPhone(r.waId),
            name: r.name ?? null,
            email: r.email ?? null,
            tags: r.tags,
            attributes: r.attributes,
          })),
          select: { id: true, waId: true, optInStatus: true },
          skipDuplicates: true,
        });
        summary.created += created.length;

        for (const r of chunk) {
          const c = byWaId.get(r.waId);
          if (!c) continue;
          await tx.contact.update({
            where: { id: c.id },
            data: {
              name: r.name ?? undefined,
              email: r.email ?? undefined,
              tags: [...new Set([...c.tags, ...r.tags])],
              attributes: { ...(c.attributes as object), ...r.attributes },
            },
          });
          summary.updated++;
        }

        // Consent, after the contacts exist.
        const status = new Map<string, { id: string; optInStatus: OptInStatus }>([
          ...existing.map((c) => [c.waId!, c] as const),
          ...created.map((c) => [c.waId!, c] as const),
        ]);
        for (const r of chunk) {
          const c = status.get(r.waId);
          if (!c) continue;
          const wantsIn = r.optedIn ?? (options.allOptedIn ? true : null);
          if (wantsIn === true) {
            if (c.optInStatus === "OPTED_OUT") summary.keptOptedOut++;
            else if (await setConsent(c.id, "OPTED_IN", "csv", tx)) summary.optedIn++;
          } else if (wantsIn === false) {
            if (await setConsent(c.id, "OPTED_OUT", "csv", tx)) summary.optedOut++;
          }
        }
      },
      { timeout: 120_000 },
    );
  }

  return summary;
}
