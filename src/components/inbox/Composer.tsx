"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";
import { isWindowOpen } from "@/lib/whatsapp-window";
import { TemplatePicker } from "./TemplatePicker";

type Props = {
  conversation: ConversationDetailDTO;
  onSent: (message: MessageDTO) => void;
};

/** The reply box at the bottom of a conversation. */
export function Composer({ conversation, onSent }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useTemplate, setUseTemplate] = useState(false);

  const isWhatsApp = conversation.channel === "WHATSAPP";
  const windowOpen = isWindowOpen(conversation.lastInboundAt);
  // Outside WhatsApp's 24h window only templates are allowed.
  const templateMode = isWhatsApp && (useTemplate || !windowOpen);

  async function send(body: unknown, restoreText = "") {
    setSending(true);
    setError(null);
    try {
      onSent(await api.post<MessageDTO>(`/api/conversations/${conversation.id}/messages`, body));
      setUseTemplate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
      if (restoreText) setText(restoreText); // give you your text back
    } finally {
      setSending(false);
    }
  }

  function sendText() {
    const value = text.trim();
    if (!value || sending) return;
    setText(""); // the message shows up in the thread right away (as "sending")
    send({ kind: "text", text: value }, text);
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      {isWhatsApp && !windowOpen && (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          The customer hasn&apos;t written in the last 24 hours, so WhatsApp only allows approved templates.
        </p>
      )}
      {conversation.channel === "WEB_BOT" && conversation.status === "BOT" && (
        <p className="mb-2 text-xs text-slate-500">Replying will take this conversation over from your bot.</p>
      )}
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      {templateMode ? (
        <TemplatePicker
          sending={sending}
          onSend={(t) => send({ kind: "template", ...t })}
          onCancel={windowOpen ? () => setUseTemplate(false) : undefined}
        />
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-10 flex-1 resize-none"
            rows={2}
            placeholder="Type a reply…  (Enter to send, Shift+Enter for new line)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendText();
              }
            }}
          />
          <div className="flex flex-col gap-1">
            {isWhatsApp && (
              <button className="btn" onClick={() => setUseTemplate(true)}>
                Template
              </button>
            )}
            <button className="btn-primary" disabled={sending || !text.trim()} onClick={sendText}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
