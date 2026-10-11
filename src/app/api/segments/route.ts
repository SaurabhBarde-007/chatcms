import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { listSegments, saveSegment, segmentBodySchema } from "@/lib/marketing/segment-service";

// GET /api/segments → segments with their current size
export async function GET() {
  return NextResponse.json(await listSegments());
}

// POST /api/segments { name, description?, rules }
export async function POST(req: NextRequest) {
  const parsed = segmentBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid segment" }, { status: 400 });
  try {
    const segment = await saveSegment(parsed.data);
    return NextResponse.json({ id: segment.id });
  } catch (err) {
    return errorResponse(err);
  }
}
