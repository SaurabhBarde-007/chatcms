import { NextResponse, type NextRequest } from "next/server";
import { getCampaign } from "@/lib/marketing/campaigns";

// GET /api/campaigns/:id → details, funnel, failure reasons, button taps
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]">) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(campaign);
}
