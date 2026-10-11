import type { Channel } from "@/generated/prisma/client";

/**
 * A message coming INTO the inbox from any channel, already normalized.
 * The WhatsApp webhook and the bot ingest API both convert their payloads to this shape.
 */
export type InboundMessage = {
  channel: Channel;
  /** Conversation id on the channel side (bot session id / WhatsApp wa_id). */
  conversationExternalId: string;
  contact: { name?: string | null; phone?: string | null; email?: string | null };
  message: {
    externalId?: string | null;
    /** CUSTOMER = the customer wrote it. BOT = your bot replied (logged for history). */
    senderType: "CUSTOMER" | "BOT";
    type: string;
    body?: string | null;
    mediaId?: string | null;
    mediaUrl?: string | null;
    mimeType?: string | null;
    /** The channel's id of the message being replied to (WhatsApp `context.id`). */
    replyToExternalId?: string | null;
    raw?: unknown;
    timestamp?: Date;
  };
};

/** A reply we send to a customer. */
export type OutgoingMessage =
  | { kind: "text"; text: string }
  | { kind: "template"; name: string; language: string; params: string[] };

export type SendResult = {
  /** The id the channel gave the message (e.g. WhatsApp wamid), if any. */
  externalId?: string;
};

export type ConversationRef = {
  id: string;
  externalId: string;
};

/**
 * Every channel implements this. To add a channel (Instagram, Telegram...):
 * create a file next to this one, implement ChannelAdapter, register it in ./index.ts.
 */
export interface ChannelAdapter {
  /** Deliver a reply to the customer. Throw on failure. */
  send(conversation: ConversationRef, message: OutgoingMessage): Promise<SendResult>;

  /** Called when a conversation switches between BOT and HUMAN. */
  onHandoff?(conversation: ConversationRef, mode: "BOT" | "HUMAN"): Promise<void>;
}
