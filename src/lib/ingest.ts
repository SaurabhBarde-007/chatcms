import { Prisma, type Channel, type ConversationStatus } from "@/generated/prisma/client";
import type { InboundMessage } from "./channels/types";
import { db } from "./db";
import { publish } from "./realtime/publish";

// Status for a new (or re-opened) conversation. WhatsApp has no bot in front of it,
// so those go straight to you.
const DEFAULT_STATUS: Record<Channel, ConversationStatus> = {
  WEB_BOT: "BOT",
  WHATSAPP: "HUMAN",
};

/**
 * Save one inbound message: find/create the conversation + contact, store the message,
 * update the conversation's summary fields, then push it to open dashboards.
 * Safe to call twice with the same externalId (webhooks get resent).
 */
export async function saveInboundMessage(input: InboundMessage): Promise<{ duplicate: boolean }> {
  const { channel, conversationExternalId, contact, message } = input;

  if (message.externalId) {
    const existing = await db.message.findUnique({ where: { externalId: message.externalId } });
    if (existing) return { duplicate: true };
  }

  const conversation = await findOrCreateConversation(channel, conversationExternalId, contact);

  // Fill in contact details we didn't know before (never overwrite with empty values).
  const contactUpdate = {
    name: contact.name || undefined,
    phone: contact.phone || undefined,
    email: contact.email || undefined,
  };
  if (Object.values(contactUpdate).some(Boolean)) {
    await db.contact.update({ where: { id: conversation.contactId }, data: contactUpdate });
  }

  const isCustomer = message.senderType === "CUSTOMER";
  const createdAt = message.timestamp ?? new Date();

  let saved;
  try {
    saved = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: conversation.id,
          direction: isCustomer ? "IN" : "OUT",
          senderType: message.senderType,
          type: message.type,
          body: message.body,
          mediaId: message.mediaId,
          mediaUrl: message.mediaUrl,
          mimeType: message.mimeType,
          raw: (message.raw ?? undefined) as Prisma.InputJsonValue | undefined,
          externalId: message.externalId,
          status: isCustomer ? "DELIVERED" : "SENT",
          createdAt,
        },
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: createdAt,
          lastMessageText: previewText(message.type, message.body),
          ...(isCustomer && {
            lastInboundAt: createdAt,
            unreadCount: { increment: 1 },
            // A customer writing into a closed conversation re-opens it.
            ...(conversation.status === "CLOSED" && { status: DEFAULT_STATUS[channel] }),
          }),
        },
      });

      return created;
    });
  } catch (err) {
    // Two identical webhooks raced each other: the unique externalId caught it.
    if (isUniqueViolation(err)) return { duplicate: true };
    throw err;
  }

  await publish({ kind: "message", id: saved.id });
  return { duplicate: false };
}

async function findOrCreateConversation(
  channel: Channel,
  externalId: string,
  contact: InboundMessage["contact"],
) {
  const args = {
    where: { channel_externalId: { channel, externalId } },
    create: {
      channel,
      externalId,
      status: DEFAULT_STATUS[channel],
      contact: { create: { name: contact.name, phone: contact.phone, email: contact.email } },
    },
    update: {},
  };

  try {
    return await db.conversation.upsert(args);
  } catch (err) {
    // A customer's first two messages arrived together and the other request created
    // the conversation first. It exists now, so the retry just finds it.
    if (isUniqueViolation(err)) return db.conversation.upsert(args);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Short text shown in the conversation list. */
export function previewText(type: string, body?: string | null): string {
  if (body) return body.slice(0, 200);
  return `[${type}]`;
}
