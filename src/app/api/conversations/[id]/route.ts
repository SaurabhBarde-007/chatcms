import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConversation, setStatus, UserError } from "@/lib/conversations";

// GET /api/conversations/:id  → conversation + its latest messages
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const conversation = await getConversation(id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(conversation);
}

const patchSchema = z.object({ status: z.enum(["BOT", "HUMAN", "CLOSED"]) });

// PATCH /api/conversations/:id  { status }  → take over / hand back / close / reopen
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/conversations/[id]">) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { id } = await ctx.params;
  try {
    await setStatus(id, parsed.data.status);
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
