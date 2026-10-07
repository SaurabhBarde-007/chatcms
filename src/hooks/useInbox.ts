"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import {
  applyEventToList,
  applyEventToThread,
  clearUnread,
  type Filters,
  filtersToQuery,
  NO_FILTERS,
  upsertMessage,
} from "@/lib/inbox-state";
import type { ConversationDetailDTO, ConversationSummaryDTO, InboxEvent, MessageDTO } from "@/lib/types";
import { useInboxStream } from "./useInboxStream";

// While a text search is active we can't tell locally whether a changed conversation
// matches, so we refetch the list instead — at most this often.
const SEARCH_REFRESH_MS = 500;

/**
 * All inbox state: the conversation list, the open conversation, and the live stream that
 * keeps both up to date. Data is fetched once, then patched by real-time events; whenever
 * the stream (re)connects we refetch, so nothing missed while offline is lost.
 */
export function useInbox() {
  // The open conversation lives in the URL (?c=...), so refresh and the back button work.
  const selectedId = useSearchParams().get("c");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const [list, setList] = useState<ConversationSummaryDTO[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationDetailDTO | null>(null);
  const [threadError, setThreadError] = useState<{ id: string; message: string } | null>(null);

  // Stream callbacks are created once and read the latest values from these refs.
  const filtersRef = useRef(filters);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    filtersRef.current = filters;
    selectedRef.current = selectedId;
  });

  const markRead = useCallback((id: string) => {
    setList((l) => l && l.map((c) => clearUnread(c, id)));
    setThread((t) => t && clearUnread(t, id));
    api.post(`/api/conversations/${id}/read`).catch((err) => console.error("[inbox] mark read failed:", err));
  }, []);

  const loadList = useCallback(async () => {
    const f = filtersRef.current;
    try {
      const data = await api.get<ConversationSummaryDTO[]>(`/api/conversations?${filtersToQuery(f)}`);
      if (filtersRef.current !== f) return; // filters changed while loading
      setList(data);
      setListError(null);
    } catch (err) {
      setListError(errorMessage(err));
    }
  }, []);

  const loadThread = useCallback(async () => {
    const id = selectedRef.current;
    if (!id) return;
    try {
      const data = await api.get<ConversationDetailDTO>(`/api/conversations/${id}`);
      if (selectedRef.current !== id) return; // you opened another one meanwhile
      setThread(data);
      setThreadError(null);
      if (data.unreadCount > 0 && document.visibilityState === "visible") markRead(id);
    } catch (err) {
      setThreadError({ id, message: errorMessage(err) });
    }
  }, [markRead]);

  useEffect(() => {
    loadList();
  }, [filters, loadList]);

  useEffect(() => {
    loadThread();
  }, [selectedId, loadThread]);

  // ---- live updates -------------------------------------------------------

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onEvent = useCallback(
    (event: InboxEvent) => {
      const f = filtersRef.current;
      if (f.q.trim()) {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(loadList, SEARCH_REFRESH_MS);
      } else {
        setList((l) => applyEventToList(l, event, f));
      }
      setThread((t) => applyEventToThread(t, event));

      // A new message in the chat you're looking at counts as read.
      const id = event.conversation.id;
      if (id === selectedRef.current && event.conversation.unreadCount > 0 && document.visibilityState === "visible") {
        markRead(id);
      }
    },
    [loadList, markRead],
  );

  const onReady = useCallback(() => {
    loadList();
    loadThread();
  }, [loadList, loadThread]);

  const connection = useInboxStream({ onEvent, onReady });

  // Coming back to the tab marks the open chat as read.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && selectedRef.current) markRead(selectedRef.current);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  // Unread total in the browser tab title.
  const totalUnread = list?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) Inbox · ChatCMS Adv` : "Inbox · ChatCMS Adv";
  }, [totalUnread]);

  // ---- actions ------------------------------------------------------------

  const select = useCallback((id: string | null) => {
    window.history.pushState(null, "", id ? `?c=${encodeURIComponent(id)}` : window.location.pathname);
  }, []);

  /** Show your reply right away (the stream would deliver it too; duplicates merge by id). */
  const onReplySent = useCallback((message: MessageDTO) => {
    setThread((t) => (t && t.id === message.conversationId ? { ...t, messages: upsertMessage(t.messages, message) } : t));
  }, []);

  /** After you change something: if the stream is down, refetch so the screen isn't stale. */
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  });
  const refreshIfOffline = useCallback(() => {
    if (connectionRef.current !== "live") onReady();
  }, [onReady]);

  return {
    filters,
    setFilters,
    selectedId,
    select,
    list,
    listError,
    // Only show the thread that belongs to the current selection.
    thread: thread && thread.id === selectedId ? thread : null,
    threadError: threadError && threadError.id === selectedId ? threadError.message : null,
    connection,
    onReplySent,
    refreshIfOffline,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}
