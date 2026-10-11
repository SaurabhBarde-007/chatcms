import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listContacts } from "@/lib/marketing/contacts";

const querySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]).optional(),
  tag: z.string().optional(),
  cursor: z.string().optional(),
});

// GET /api/contacts?q=&status=&tag=&cursor=  → { contacts, total, nextCursor }
export async function GET(req: NextRequest) {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  return NextResponse.json(await listContacts(parsed.data));
}
