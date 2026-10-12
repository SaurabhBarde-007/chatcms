import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listRecipients, STAGES } from "@/lib/marketing/campaigns";

const querySchema = z.object({ stage: z.enum(STAGES).default("all"), cursor: z.string().optional() });

// GET /api/campaigns/:id/recipients?stage=sent|delivered|read|replied|clicked|failed|pending|paid&cursor=
export async function GET(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/recipients">) {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  const { id } = await ctx.params;
  return NextResponse.json(await listRecipients(id, parsed.data.stage, parsed.data.cursor));
}
