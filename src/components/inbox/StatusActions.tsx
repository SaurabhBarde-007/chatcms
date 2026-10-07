"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { ConversationDetailDTO, ConversationStatusName } from "@/lib/types";

type Props = { conversation: ConversationDetailDTO; onChanged: () => void };

/** Take over / hand back to bot / close / reopen buttons. */
export function StatusActions({ conversation, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasBot = conversation.channel === "WEB_BOT"; // WhatsApp has no bot in front of it

  async function setStatus(status: ConversationStatusName) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/conversations/${conversation.id}`, { status });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update conversation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {conversation.status === "BOT" && (
          <button className="btn" disabled={busy} onClick={() => setStatus("HUMAN")}>
            Take over
          </button>
        )}
        {conversation.status === "HUMAN" && hasBot && (
          <button className="btn" disabled={busy} onClick={() => setStatus("BOT")}>
            Hand back to bot
          </button>
        )}
        {conversation.status !== "CLOSED" ? (
          <button className="btn" disabled={busy} onClick={() => setStatus("CLOSED")}>
            Close
          </button>
        ) : (
          <button className="btn" disabled={busy} onClick={() => setStatus(hasBot ? "BOT" : "HUMAN")}>
            Reopen
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
