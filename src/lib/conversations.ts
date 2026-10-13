import type { Channel, ConversationStatus, Message } from "@/generated/prisma/client";
import { getAdapter } from "./channels";
import type { OutgoingMessage } from "./channels/types";
import type { WhatsAppStatusUpdate } from "./channels/whatsapp";
import { db } from "./db";
import { UserError } from "./errors";
import { isStatusAdvance } from "./message-status";
import { toMessageDTO, toSummaryDTO } from "./dto";
import { ENABLED_CHANNELS } from "./enabled-channels";
import { previewText } from "./ingest";
import { onCampaignStatus } from "./marketing/campaign-status";
import { publish } from "./realtime/publish";
import type { ConversationDetailDTO, ConversationSummaryDTO, MessageDTO } from "./types";
import { isWindowOpen } from "./whatsapp-window";

// Everything the dashboard does with conversations lives here.
// API routes stay thin: parse the request, call a function below, return JSON.
// Every change ends with publish() so all open dashboards update instantly.

export { UserError } from "./errors";

const LIST_LIMIT = 100;
const THREAD_LIMIT = 500;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type ConversationFilters = {
  channel?: Channel;
  status?: ConversationStatus;
  search?: string;
};

export async function listConversations(filters: ConversationFilters): Promise<ConversationSummaryDTO[]> {
  const search = filters.search?.trim();
  const channels = ENABLED_CHANNELS.filter((c) => !filters.channel || c === filters.channel);

  const rows = await db.conversation.findMany({
    where: {
      channel: { in: [...channels] },
      status: filters.status,
      // Campaign sends don't fill this in, so a chat only shows up once there's a real exchange.
      lastMessageText: { not: null },
      ...(search && {
        OR: [
          { contact: { name: { contains: search, mode: "insensitive" } } },
          { contact: { phone: { contains: search } } },
          { contact: { email: { contains: search, mode: "insensitive" } } },
          { messages: { some: { body: { contains: search, mode: "insensitive" } } } },
        ],
      }),
    },
    include: { contact: true },
    orderBy: { lastMessageAt: "desc" },
    take: LIST_LIMIT,
  });

  return rows.map(toSummaryDTO);
}

export async function getConversation(id: string): Promise<ConversationDetailDTO | null> {
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      // The newest messages, flipped back to oldest-first below.
      messages: { orderBy: { createdAt: "desc" }, take: THREAD_LIMIT },
    },
  });
  if (!conversation) return null;

  return {
    ...toSummaryDTO(conversation),
    messages: conversation.messages.reverse().map(toMessageDTO),
  };
}

/** Called when a conversation is open on screen. */
export async function markRead(id: string) {
  const { count } = await db.conversation.updateMany({
    where: { id, unreadCount: { gt: 0 } },
    data: { unreadCount: 0 },
  });
  if (count > 0) await publish({ kind: "conversation", id });
}

// ---------------------------------------------------------------------------
// Replying
// ---------------------------------------------------------------------------

/**
 * Send a reply to the customer on whatever channel the conversation is on.
 *
 * This is the ONE function that sends replies. The dashboard uses it today;
 * an AI agent added later should call it too.
 *
 * The message is saved as PENDING first (so it shows up instantly, even if sending fails),
 * then marked SENT or FAILED.
 */
export async function sendReply(conversationId: string, outgoing: OutgoingMessage): Promise<MessageDTO> {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId }, include: { contact: { select: { blocked: true } } } });
  if (!conversation) throw new UserError("Conversation not found");
  if (conversation.contact.blocked) throw new UserError("This contact is blocked. Unblock them to reply.");

  if (conversation.channel === "WHATSAPP") {
    if (outgoing.kind === "text" && !isWindowOpen(conversation.lastInboundAt)) {
      throw new UserError("The 24h WhatsApp window is closed. Send an approved template instead.");
    }
  } else if (outgoing.kind === "template") {
    throw new UserError("Templates are only available on WhatsApp.");
  }

  // Replying yourself means you take the conversation over from the bot.
  if (conversation.status !== "HUMAN") {
    await setStatus(conversationId, "HUMAN");
  }

  const body = outgoing.kind === "text" ? outgoing.text : templatePreview(outgoing);
  const pending = await db.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: { conversationId, direction: "OUT", senderType: "HUMAN", type: outgoing.kind, body, status: "PENDING" },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt, lastMessageText: previewText(message.type, message.body) },
    });
    return message;
  });
  await publish({ kind: "message", id: pending.id });

  let saved: Message;
  try {
    const result = await getAdapter(conversation.channel).send(conversation, outgoing);
    saved = await db.message.update({
      where: { id: pending.id },
      data: { status: "SENT", externalId: result.externalId },
    });
  } catch (err) {
    saved = await db.message.update({
      where: { id: pending.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
  }
  await publish({ kind: "message", id: saved.id });

  return toMessageDTO(saved);
}

function templatePreview(t: { name: string; params: string[] }) {
  return `[Template: ${t.name}]${t.params.length ? " " + t.params.join(" | ") : ""}`;
}

// ---------------------------------------------------------------------------
// Status: take over from bot / hand back to bot / close
// ---------------------------------------------------------------------------

export async function setStatus(id: string, status: ConversationStatus) {
  const conversation = await db.conversation.findUnique({ where: { id } });
  if (!conversation) throw new UserError("Conversation not found");
  if (conversation.status === status) return;

  await db.conversation.update({ where: { id }, data: { status } });
  await publish({ kind: "conversation", id });

  // Tell the channel (your bot) to pause or resume its auto-replies.
  if (status !== "CLOSED") {
    await getAdapter(conversation.channel)
      .onHandoff?.(conversation, status)
      .catch((err) => console.error("[handoff] failed to notify channel:", err));
  }
}

// ---------------------------------------------------------------------------
// Delivery status updates from WhatsApp (sent → delivered → read)
// ---------------------------------------------------------------------------

export async function applyStatusUpdate(update: WhatsAppStatusUpdate) {
  const message = await db.message.findUnique({ where: { externalId: update.externalId } });
  if (!message) return; // e.g. a message sent from outside this app

  // Webhooks can arrive out of order; never move backwards (read → delivered).
  if (!isStatusAdvance(message.status, update.status)) return;

  await db.message.update({
    where: { id: message.id },
    data: { status: update.status, error: update.error ?? null },
  });

  if (message.senderType === "CAMPAIGN") {
    // Campaign ticks feed the campaign's analytics. They aren't pushed live to the inbox:
    // a broadcast can produce thousands of them.
    await onCampaignStatus(message.id, update);
    return;
  }
  await publish({ kind: "message", id: message.id });
}
