import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { createContact, listContacts } from "@/lib/marketing/contacts";

const querySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]).optional(),
  tag: z.string().optional(),
  blocked: z.literal("1").transform(() => true).optional(),
  cursor: z.string().optional(),
});

// GET /api/contacts?q=&status=&tag=&blocked=1&cursor=  → { contacts, total, nextCursor }
export async function GET(req: NextRequest) {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  return NextResponse.json(await listContacts(parsed.data));
}

const createSchema = z.object({
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  defaultCountryCode: z.string().regex(/^\d{0,4}$/).optional(),
  name: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(50).optional(),
  attributes: z.record(z.string().max(50), z.string().max(500)).optional(),
  optedIn: z.boolean().optional(),
});

// POST /api/contacts  { phone, defaultCountryCode?, name?, email?, tags?, attributes?, optedIn? } → the new contact
export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid contact" }, { status: 400 });
  try {
    return NextResponse.json(await createContact(parsed.data), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
