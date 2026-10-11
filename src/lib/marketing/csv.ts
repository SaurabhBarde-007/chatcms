import Papa from "papaparse";
import { normalizeWaId } from "./phone";

// Turning an uploaded CSV into contacts. Column names are matched loosely
// ("Phone Number", "mobile", "WhatsApp" all work); unknown columns become custom fields.

export type ImportRow = {
  waId: string;
  name?: string;
  email?: string;
  tags: string[];
  /** true/false from an opt-in column, null if the file doesn't say. */
  optedIn: boolean | null;
  attributes: Record<string, string>;
};

export type ImportProblem = { line: number; reason: string };

const ALIASES: Record<string, string[]> = {
  phone: ["phone", "phone_number", "phonenumber", "mobile", "mobile_number", "whatsapp", "whatsapp_number", "number", "wa_id", "contact_number"],
  name: ["name", "full_name", "fullname", "customer_name", "contact_name"],
  first_name: ["first_name", "firstname"],
  last_name: ["last_name", "lastname", "surname"],
  email: ["email", "email_address", "e_mail"],
  tags: ["tags", "tag", "labels", "label", "segments"],
  opted_in: ["opted_in", "opt_in", "optin", "consent", "whatsapp_opt_in", "subscribed", "marketing_opt_in"],
};

const YES = new Set(["yes", "y", "true", "1", "opted_in", "opted in", "subscribed", "optin", "opt_in"]);
const NO = new Set(["no", "n", "false", "0", "opted_out", "opted out", "unsubscribed", "optout", "opt_out"]);

export const MAX_IMPORT_ROWS = 50_000;

/** "Phone Number " → "phone_number" */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function parseCsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  return result.data;
}

function pick(record: Record<string, string>, field: keyof typeof ALIASES): string | undefined {
  for (const key of ALIASES[field]) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function splitTags(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Validate and normalize rows. Rows with the same number are merged (later values win, tags add up).
 * `line` in problems is the CSV line number (header = line 1).
 */
export function mapCsvRows(
  records: Record<string, string>[],
  options: { defaultCountryCode?: string; addTags?: string[] } = {},
): { rows: ImportRow[]; problems: ImportProblem[] } {
  const known = new Set(Object.values(ALIASES).flat());
  const byWaId = new Map<string, ImportRow>();
  const problems: ImportProblem[] = [];

  records.forEach((record, i) => {
    const line = i + 2;
    const rawPhone = pick(record, "phone");
    if (!rawPhone) return problems.push({ line, reason: "No phone number" });

    const waId = normalizeWaId(rawPhone, options.defaultCountryCode);
    if (!waId) return problems.push({ line, reason: `"${rawPhone}" isn't a valid phone number (include the country code)` });

    const consent = pick(record, "opted_in")?.toLowerCase();
    const optedIn = consent === undefined ? null : YES.has(consent) ? true : NO.has(consent) ? false : null;
    if (consent !== undefined && optedIn === null) problems.push({ line, reason: `Opt-in value "${consent}" not understood; left as is` });

    const fullName =
      pick(record, "name") ?? ([pick(record, "first_name"), pick(record, "last_name")].filter(Boolean).join(" ") || undefined);

    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key && !known.has(key) && value?.trim()) attributes[key] = value.trim();
    }

    const previous = byWaId.get(waId);
    byWaId.set(waId, {
      waId,
      name: fullName ?? previous?.name,
      email: pick(record, "email") ?? previous?.email,
      tags: [...new Set([...(previous?.tags ?? []), ...splitTags(pick(record, "tags")), ...(options.addTags ?? [])])],
      optedIn: optedIn ?? previous?.optedIn ?? null,
      attributes: { ...previous?.attributes, ...attributes },
    });
  });

  return { rows: [...byWaId.values()], problems };
}
