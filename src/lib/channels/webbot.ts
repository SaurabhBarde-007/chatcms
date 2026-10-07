import { z } from "zod";
import { env } from "../env";
import { signBody } from "../signatures";
import type { ChannelAdapter, InboundMessage } from "./types";

// Your own chatbot platform. Full contract: docs/BOT_INTEGRATION.md

// ---------------------------------------------------------------------------
// Inbound: what your bot POSTs to /api/ingest/messages
// ---------------------------------------------------------------------------

export const botIngestSchema = z.object({
  conversationId: z.string().min(1),
  contact: z
    .object({
      name: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
    })
    .default({}),
  message: z.object({
    id: z.string().min(1),
    senderType: z.enum(["CUSTOMER", "BOT"]),
    type: z.string().default("text"),
    text: z.string().nullish(),
    mediaUrl: z.url().nullish(),
    mimeType: z.string().nullish(),
    timestamp: z.coerce.date().optional(),
  }),
});

export type BotIngestPayload = z.infer<typeof botIngestSchema>;

export function botPayloadToInbound(p: BotIngestPayload): InboundMessage {
  return {
    channel: "WEB_BOT",
    conversationExternalId: p.conversationId,
    contact: p.contact,
    message: {
      // Prefix so bot ids can never collide with WhatsApp wamids in the unique column.
      externalId: `bot:${p.message.id}`,
      senderType: p.message.senderType,
      type: p.message.type,
      body: p.message.text,
      mediaUrl: p.message.mediaUrl,
      mimeType: p.message.mimeType,
      raw: p,
      timestamp: p.message.timestamp,
    },
  };
}

// ---------------------------------------------------------------------------
// Outbound: we POST replies + handoff events to BOT_CALLBACK_URL
// ---------------------------------------------------------------------------

async function postToBot(event: Record<string, unknown>): Promise<Response> {
  const body = JSON.stringify(event);
  const res = await fetch(env.bot.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signBody(body, env.bot.ingestSecret) },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Bot callback responded ${res.status}`);
  return res;
}

export const webBotAdapter: ChannelAdapter = {
  async send(conversation, message) {
    if (message.kind !== "text") throw new Error("Your chatbot only supports text replies");

    const res = await postToBot({
      type: "reply",
      conversationId: conversation.externalId,
      message: { text: message.text },
    });

    // Optional: if your bot answers { "id": "..." } we keep it as the external id.
    const data = await res.json().catch(() => null);
    return { externalId: data?.id ? `bot:${data.id}` : undefined };
  },

  async onHandoff(conversation, mode) {
    await postToBot({ type: "handoff", conversationId: conversation.externalId, mode });
  },
};
