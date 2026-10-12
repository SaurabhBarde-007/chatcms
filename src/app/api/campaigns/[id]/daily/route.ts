import { NextResponse, type NextRequest } from "next/server";
import { isValidTimeZone } from "@/lib/marketing/analytics";
import { campaignDaily } from "@/lib/marketing/campaigns";

// GET /api/campaigns/:id/daily?tz= → messages per day (sent / read / replied)
export async function GET(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/daily">) {
  const tz = req.nextUrl.searchParams.get("tz") ?? "UTC";
  const { id } = await ctx.params;
  return NextResponse.json(await campaignDaily(id, isValidTimeZone(tz) ? tz : "UTC"));
}
