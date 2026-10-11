import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { cancelCampaign } from "@/lib/marketing/campaigns";

// POST /api/campaigns/:id/cancel → stop a scheduled or sending campaign
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/cancel">) {
  const { id } = await ctx.params;
  try {
    await cancelCampaign(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
