import { NextResponse, type NextRequest } from "next/server";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp";
import { applyStatusUpdate } from "@/lib/conversations";
import { env } from "@/lib/env";
import { saveInboundMessage } from "@/lib/ingest";
import { isValidSignature } from "@/lib/signatures";

// Webhook URL to configure in Meta: https://<your-domain>/api/webhooks/whatsapp

/** Meta's one-time verification handshake when you save the webhook URL. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === env.whatsapp.verifyToken) {
    return new NextResponse(params.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Incoming messages and delivery statuses. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"), env.whatsapp.appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Body must be JSON", { status: 400 });
  }

  const { messages, statuses } = parseWhatsAppWebhook(payload);

  // Errors are logged, not returned: a non-200 makes Meta resend the whole batch.
  for (const message of messages) {
    await saveInboundMessage(message).catch((err) => console.error("[whatsapp] save failed:", err));
  }
  for (const status of statuses) {
    await applyStatusUpdate(status).catch((err) => console.error("[whatsapp] status failed:", err));
  }

  return NextResponse.json({ ok: true });
}
