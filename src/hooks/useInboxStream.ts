"use client";

import { useEffect, useRef, useState } from "react";
import type { InboxEvent } from "@/lib/types";

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

type Handlers = {
  /** Something changed (a message, a delivery tick, a status, an unread count). */
  onEvent: (event: InboxEvent) => void;
  /** We're connected and listening: (re)fetch everything, in case we missed events while offline. */
  onReady: () => void;
};

// If the server answered with an error, EventSource gives up; we try again after this long.
// (Ordinary drops are retried by the browser itself, after the server's `retry:` hint.)
const RETRY_AFTER_ERROR_MS = 5000;

/** Subscribes to /api/stream (Server-Sent Events) for as long as the component is mounted. */
export function useInboxStream(handlers: Handlers): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  // The connection is opened once; it always calls the latest handlers.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let source: EventSource;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function open() {
      source = new EventSource("/api/stream");

      source.addEventListener("ready", () => {
        setStatus("live");
        handlersRef.current.onReady();
      });

      source.addEventListener("inbox", (e) => {
        try {
          handlersRef.current.onEvent(JSON.parse((e as MessageEvent<string>).data));
        } catch (err) {
          console.error("[stream] bad event:", err);
        }
      });

      source.onerror = () => {
        setStatus("reconnecting");
        if (source.readyState === EventSource.CLOSED) {
          retryTimer = setTimeout(open, RETRY_AFTER_ERROR_MS);
        }
      };
    }

    open();
    return () => {
      clearTimeout(retryTimer);
      source.close();
    };
  }, []);

  return status;
}
