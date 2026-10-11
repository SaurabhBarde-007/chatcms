import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { deleteSegment, saveSegment, segmentBodySchema } from "@/lib/marketing/segment-service";

// PATCH /api/segments/:id { name, description?, rules }
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/segments/[id]">) {
  const parsed = segmentBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid segment" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await saveSegment({ id, ...parsed.data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/segments/:id
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/segments/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteSegment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
