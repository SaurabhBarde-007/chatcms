// JSON shapes returned by our API, pushed over the real-time stream, and used by the UI.
// Kept separate from Prisma types so the browser never imports server code.

export type ChannelName = "WEB_BOT" | "WHATSAPP";
export type ConversationStatusName = "BOT" | "HUMAN" | "CLOSED";
export type MessageStatusName = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export type ContactDTO = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
};

export type ConversationSummaryDTO = {
  id: string;
  channel: ChannelName;
  status: ConversationStatusName;
  externalId: string;
  contact: ContactDTO;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
};

export type MessageDTO = {
  id: string;
  conversationId: string;
  direction: "IN" | "OUT";
  senderType: "CUSTOMER" | "BOT" | "HUMAN";
  type: string;
  body: string | null;
  mediaSrc: string | null;
  mimeType: string | null;
  status: MessageStatusName;
  error: string | null;
  createdAt: string;
};

export type ConversationDetailDTO = ConversationSummaryDTO & {
  messages: MessageDTO[];
};

export type TemplateDTO = {
  name: string;
  language: string;
  body: string;
  paramCount: number;
};

/**
 * Pushed to the dashboard over /api/stream (SSE event "inbox").
 * - message: a message was created or its delivery status changed (includes its conversation's new summary)
 * - conversation: a conversation's status / unread count changed
 */
export type InboxEvent =
  | { type: "message"; message: MessageDTO; conversation: ConversationSummaryDTO }
  | { type: "conversation"; conversation: ConversationSummaryDTO };
