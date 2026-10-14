import type { Message, Prisma } from "@/generated/prisma/client";
import type { ConversationSummaryDTO, MessageDTO } from "./types";

// Database row → JSON for the UI. Used by the REST routes AND the real-time stream,
// so both always send exactly the same shape.

export type ConversationWithContact = Prisma.ConversationGetPayload<{ include: { contact: true } }>;

export function toSummaryDTO(c: ConversationWithContact): ConversationSummaryDTO {
  return {
    id: c.id,
    channel: c.channel,
    status: c.status,
    externalId: c.externalId,
    contact: {
      id: c.contact.id,
      name: c.contact.name,
      phone: c.contact.phone,
      email: c.contact.email,
      optInStatus: c.contact.optInStatus,
      optInSource: c.contact.optInSource,
      tags: c.contact.tags,
      attributes: (c.contact.attributes ?? {}) as Record<string, unknown>,
      blocked: c.contact.blocked,
    },
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessageText: c.lastMessageText,
    lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
  };
}

export function toMessageDTO(m: Message): MessageDTO {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    senderType: m.senderType,
    type: m.type,
    body: m.body,
    mediaSrc: m.mediaId ? `/api/media/${m.mediaId}` : m.mediaUrl,
    mimeType: m.mimeType,
    status: m.status,
    error: m.error,
    createdAt: m.createdAt.toISOString(),
  };
}
