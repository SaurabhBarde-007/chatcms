import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sendReply, UserError } from "@/lib/conversations";

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(4096) }),
  z.object({
    kind: z.literal("template"),
    name: z.string().min(1),
    language: z.string().min(1),
    params: z.array(z.string()).default([]),
  }),
]);

// POST /api/conversations/:id/messages  { kind: "text", text } | { kind: "template", ... }
export async function POST(req: NextRequest, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

  const { id } = await ctx.params;
  try {
    return NextResponse.json(await sendReply(id, parsed.data));
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
