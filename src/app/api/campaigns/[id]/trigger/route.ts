import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { triggerSchema, updateTrigger } from "@/lib/marketing/api-campaigns";

// PATCH /api/campaigns/:id/trigger { incoming: {...} } → change when an API campaign auto-sends
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/trigger">) {
  const parsed = triggerSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid trigger" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await updateTrigger(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
