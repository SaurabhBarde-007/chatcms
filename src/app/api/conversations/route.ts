import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listConversations } from "@/lib/conversations";

const querySchema = z.object({
  channel: z.enum(["WEB_BOT", "WHATSAPP"]).optional(),
  status: z.enum(["BOT", "HUMAN", "CLOSED"]).optional(),
  q: z.string().optional(),
});

// GET /api/conversations?channel=&status=&q=  → newest first
export async function GET(req: NextRequest) {
  const params = Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== ""));
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid filters" }, { status: 400 });

  const { channel, status, q } = parsed.data;
  return NextResponse.json(await listConversations({ channel, status, search: q }));
}
