// JSON shapes returned by our API, pushed over the real-time stream, and used by the UI.
// Kept separate from Prisma types so the browser never imports server code.

export type ChannelName = "WEB_BOT" | "WHATSAPP";
export type ConversationStatusName = "BOT" | "HUMAN" | "CLOSED";
export type MessageStatusName = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type OptInStatusName = "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";

export type ContactDTO = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  optInStatus: OptInStatusName;
  tags: string[];
  /** Custom fields, incl. "school" and "class". */
  attributes: Record<string, unknown>;
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
  senderType: "CUSTOMER" | "BOT" | "HUMAN" | "CAMPAIGN";
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
  /** The body's placeholders in the order values are sent: ["1", "2"] or ["first_name", "school"]. */
  params: string[];
  named: boolean;
};

/**
 * Pushed to the dashboard over /api/stream (SSE event "inbox").
 * - message: a message was created or its delivery status changed (includes its conversation's new summary)
 * - conversation: a conversation's status / unread count changed
 */
export type InboxEvent =
  | { type: "message"; message: MessageDTO; conversation: ConversationSummaryDTO }
  | { type: "conversation"; conversation: ConversationSummaryDTO };
