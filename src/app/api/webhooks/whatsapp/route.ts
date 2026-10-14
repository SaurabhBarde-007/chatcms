import { after, NextResponse, type NextRequest } from "next/server";
import { parseWhatsAppWebhook } from "@/lib/channels/whatsapp";
import { applyStatusUpdate } from "@/lib/conversations";
import { env } from "@/lib/env";
import { saveInboundMessage } from "@/lib/ingest";
import { sendApiRecipient } from "@/lib/marketing/campaign-runner";
import { applyMarketingPreference } from "@/lib/marketing/consent";
import { isValidSignature } from "@/lib/signatures";

// Webhook URL to configure in Meta: https://<your-domain>/api/webhooks/whatsapp

/** Meta's one-time verification handshake when you save the webhook URL. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === env.whatsapp.verifyToken) {
    console.log("[whatsapp] webhook verified by Meta");
    return new NextResponse(params.get("hub.challenge"), { status: 200 });
  }
  console.warn("[whatsapp] webhook verification failed: hub.verify_token doesn't match WA_VERIFY_TOKEN");
  return new NextResponse("Forbidden", { status: 403 });
}

/** Incoming messages, delivery statuses, and marketing preferences (subscribe to "messages" and "user_preferences"). */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!isValidSignature(rawBody, req.headers.get("x-hub-signature-256"), env.whatsapp.appSecret)) {
    // Meta signs with the App Secret of the app the webhook is configured on.
    console.warn("[whatsapp] rejected webhook: invalid signature. Is WA_APP_SECRET that app's App Secret?");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Body must be JSON", { status: 400 });
  }

  const { messages, statuses, preferences } = parseWhatsAppWebhook(payload);
  console.log(
    `[whatsapp] webhook received: ${messages.length} message(s), ${statuses.length} status update(s), ${preferences.length} marketing preference(s)`,
  );

  // Errors are logged, not returned: a non-200 makes Meta resend the whole batch.
  const autoReplies: string[] = [];
  for (const message of messages) {
    const saved = await saveInboundMessage(message).catch((err) => {
      console.error("[whatsapp] save failed:", err);
      return null;
    });
    if (saved) autoReplies.push(...saved.autoReplies);
  }
  for (const status of statuses) {
    await applyStatusUpdate(status).catch((err) => console.error("[whatsapp] status failed:", err));
  }
  for (const pref of preferences) {
    await applyMarketingPreference({ waId: pref.waId, value: pref.value, at: pref.timestamp }).catch((err) =>
      console.error("[whatsapp] marketing preference failed:", err),
    );
  }

  // API-campaign auto-replies go out right after we've answered Meta.
  if (autoReplies.length) {
    after(async () => {
      for (const id of autoReplies) {
        await sendApiRecipient(id).catch((err) => console.error("[whatsapp] auto-reply failed:", err));
      }
    });
  }

  return NextResponse.json({ ok: true });
}
