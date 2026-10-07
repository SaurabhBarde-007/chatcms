import { NextResponse, type NextRequest } from "next/server";
import { botIngestSchema, botPayloadToInbound } from "@/lib/channels/webbot";
import { isChannelEnabled } from "@/lib/enabled-channels";
import { env } from "@/lib/env";
import { saveInboundMessage } from "@/lib/ingest";
import { isValidSignature } from "@/lib/signatures";

// POST /api/ingest/messages — your chatbot sends every message (customer + bot) here.
// Contract and examples: docs/BOT_INTEGRATION.md
export async function POST(req: NextRequest) {
  if (!isChannelEnabled("WEB_BOT")) {
    return NextResponse.json({ error: "The chatbot channel is turned off (see src/lib/enabled-channels.ts)" }, { status: 404 });
  }

  const rawBody = await req.text();

  if (!isValidSignature(rawBody, req.headers.get("x-signature"), env.bot.ingestSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = botIngestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { duplicate } = await saveInboundMessage(botPayloadToInbound(parsed.data));
  return NextResponse.json({ ok: true, duplicate });
}
