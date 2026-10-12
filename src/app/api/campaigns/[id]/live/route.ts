import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { setApiCampaignLive } from "@/lib/marketing/api-campaigns";

// POST /api/campaigns/:id/live { live: true|false } → switch an API campaign on/off
export async function POST(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/live">) {
  const parsed = z.object({ live: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { live: true|false }" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await setApiCampaignLive(id, parsed.data.live);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
