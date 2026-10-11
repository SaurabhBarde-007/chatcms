import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { audienceSize } from "@/lib/marketing/campaigns";

// GET /api/campaigns/audience?segmentId=  → { size } (omit segmentId for all opted-in contacts)
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({ size: await audienceSize(req.nextUrl.searchParams.get("segmentId") || null) });
  } catch (err) {
    return errorResponse(err);
  }
}
