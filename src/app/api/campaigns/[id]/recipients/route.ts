import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listRecipients } from "@/lib/marketing/campaigns";

const querySchema = z.object({
  status: z.enum(["PENDING", "SENDING", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"]).optional(),
  cursor: z.string().optional(),
});

// GET /api/campaigns/:id/recipients?status=&cursor=
export async function GET(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/recipients">) {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  const { id } = await ctx.params;
  return NextResponse.json(await listRecipients(id, parsed.data.status, parsed.data.cursor));
}
