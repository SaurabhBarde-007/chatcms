import { NextResponse, type NextRequest } from "next/server";
import { markRead } from "@/lib/conversations";

// POST /api/conversations/:id/read  → clear the unread badge (sent while the chat is on screen)
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/conversations/[id]/read">) {
  const { id } = await ctx.params;
  await markRead(id);
  return NextResponse.json({ ok: true });
}
