import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { importContacts } from "@/lib/marketing/contacts";
import { mapCsvRows, MAX_IMPORT_ROWS, parseCsv, splitTags } from "@/lib/marketing/csv";

export const maxDuration = 300;

const bodySchema = z.object({
  csv: z.string().min(1).max(4_000_000, "File too large (max 4 MB). Split it into smaller files."),
  defaultCountryCode: z.string().regex(/^\d{0,4}$/).default(""),
  addTags: z.string().default(""),
  /** You confirm everyone in the file opted in to WhatsApp marketing (for rows without an opt-in column). */
  allOptedIn: z.boolean().default(false),
});

// POST /api/contacts/import  { csv, defaultCountryCode, addTags, allOptedIn } → import summary
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid import" }, { status: 400 });
  }
  const { csv, defaultCountryCode, addTags, allOptedIn } = parsed.data;

  const records = parseCsv(csv);
  if (records.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_IMPORT_ROWS.toLocaleString()}).` }, { status: 400 });
  }
  const { rows, problems } = mapCsvRows(records, { defaultCountryCode, addTags: splitTags(addTags) });
  if (!rows.length) {
    return NextResponse.json(
      { error: "No valid rows. The file needs a phone column (with country codes).", problems: problems.slice(0, 20) },
      { status: 400 },
    );
  }

  const summary = await importContacts(rows, problems.slice(0, 50), { allOptedIn });
  return NextResponse.json({ ...summary, skippedRows: problems.length });
}
