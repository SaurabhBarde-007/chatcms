import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { previewSegment } from "@/lib/marketing/segment-service";
import { segmentRulesSchema } from "@/lib/marketing/segments";

// POST /api/segments/preview { rules } → { size, summary, sample } (live preview in the editor)
export async function POST(req: NextRequest) {
  const parsed = z.object({ rules: segmentRulesSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid rules" }, { status: 400 });
  return NextResponse.json(await previewSegment(parsed.data.rules));
}
