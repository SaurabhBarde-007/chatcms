import { NextResponse, type NextRequest } from "next/server";
import { listAttributeValues } from "@/lib/marketing/contacts";

// GET /api/contacts/values?field=school → [{ value: "Delhi Public School", count: 120 }, …] (most common first)
export async function GET(req: NextRequest) {
  const field = req.nextUrl.searchParams.get("field") ?? "";
  if (!/^[a-z0-9_]{1,50}$/.test(field)) return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  return NextResponse.json(await listAttributeValues(field));
}
