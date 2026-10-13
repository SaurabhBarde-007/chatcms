import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { audienceSchema } from "@/lib/marketing/audience";
import { previewAudience } from "@/lib/marketing/audience-query";

// POST /api/campaigns/audience  { filters } → { size, notOptedIn, sample } (who a broadcast would reach right now)
export async function POST(req: NextRequest) {
  const parsed = audienceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid filters" }, { status: 400 });
  try {
    return NextResponse.json(await previewAudience(parsed.data.filters));
  } catch (err) {
    return errorResponse(err);
  }
}
