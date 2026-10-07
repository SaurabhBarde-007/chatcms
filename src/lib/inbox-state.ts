import { isStatusAdvance } from "./message-status";
import type {
  ChannelName,
  ConversationDetailDTO,
  ConversationStatusName,
  ConversationSummaryDTO,
  InboxEvent,
  MessageDTO,
} from "./types";

// How a live event changes what's on screen. Pure functions (no React, no fetch),
// so they're easy to test. Every update is keyed by id, so receiving the same
// event twice — or a reply via both its HTTP response and the stream — is harmless.

export type Filters = {
  channel: ChannelName | "";
  status: ConversationStatusName | "";
  q: string;
};

export const NO_FILTERS: Filters = { channel: "", status: "", q: "" };

/** Channel/status filters are checked here. Text search runs on the server, so callers refetch instead. */
export function matchesFilters(c: ConversationSummaryDTO, f: Filters): boolean {
  return (!f.channel || c.channel === f.channel) && (!f.status || c.status === f.status);
}

/** Insert or replace a conversation, drop it if it no longer matches the filters, keep newest first. */
export function upsertConversation(
  list: ConversationSummaryDTO[],
  conversation: ConversationSummaryDTO,
  filters: Filters,
): ConversationSummaryDTO[] {
  const rest = list.filter((c) => c.id !== conversation.id);
  if (!matchesFilters(conversation, filters)) return rest;
  return [...rest, conversation].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function applyEventToList(
  list: ConversationSummaryDTO[] | null,
  event: InboxEvent,
  filters: Filters,
): ConversationSummaryDTO[] | null {
  if (!list) return list; // not loaded yet; the initial fetch will include it
  return upsertConversation(list, event.conversation, filters);
}

export function applyEventToThread(
  thread: ConversationDetailDTO | null,
  event: InboxEvent,
): ConversationDetailDTO | null {
  if (!thread || thread.id !== event.conversation.id) return thread;
  return {
    ...thread,
    ...event.conversation,
    messages: event.type === "message" ? upsertMessage(thread.messages, event.message) : thread.messages,
  };
}

/** Add a message (oldest first), or update it in place if we already have it. */
export function upsertMessage(messages: MessageDTO[], message: MessageDTO): MessageDTO[] {
  const index = messages.findIndex((m) => m.id === message.id);
  if (index >= 0) {
    const next = messages.slice();
    next[index] = mergeMessage(messages[index], message);
    return next;
  }

  const next = [...messages, message];
  const last = messages[messages.length - 1];
  if (last && last.createdAt > message.createdAt) {
    next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return next;
}

/** Take the newer copy, but never move delivery status backwards (e.g. READ → SENT). */
export function mergeMessage(current: MessageDTO, incoming: MessageDTO): MessageDTO {
  if (incoming.status === current.status || isStatusAdvance(current.status, incoming.status)) {
    return incoming;
  }
  return { ...incoming, status: current.status, error: current.error };
}

/** Optimistically clear a conversation's unread badge. */
export function clearUnread<T extends ConversationSummaryDTO>(c: T, id: string): T {
  return c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c;
}

export function filtersToQuery(f: Filters): string {
  const params = new URLSearchParams();
  if (f.channel) params.set("channel", f.channel);
  if (f.status) params.set("status", f.status);
  if (f.q.trim()) params.set("q", f.q.trim());
  return params.toString();
}
