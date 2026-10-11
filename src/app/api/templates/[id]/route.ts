import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { deleteTemplate, getTemplate, updateTemplate } from "@/lib/marketing/template-admin";
import { draftSchema } from "@/lib/marketing/template-draft-schema";

export const maxDuration = 60; // editing may re-upload the header sample

// GET /api/templates/:id → the template as an editable draft
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await getTemplate(id));
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/templates/:id (a draft) → edit; it goes back to WhatsApp review
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await updateTemplate(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/templates/:id → delete this template (this language only)
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/templates/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
