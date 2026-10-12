import { NextResponse, type NextRequest } from "next/server";
import { draftSchema } from "@/lib/marketing/template-draft-schema";
import { deleteDraft, getDraft, saveDraft } from "@/lib/marketing/template-drafts";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/templates/drafts/[id]">) {
  const { id } = await ctx.params;
  const draft = await getDraft(id);
  return draft ? NextResponse.json(draft) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/templates/drafts/[id]">) {
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft" }, { status: 400 });
  const { id } = await ctx.params;
  return NextResponse.json(await saveDraft(parsed.data, id));
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/templates/drafts/[id]">) {
  const { id } = await ctx.params;
  await deleteDraft(id);
  return NextResponse.json({ ok: true });
}
