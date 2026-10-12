"use client";

import { IndianRupee } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";
import { isWindowOpen } from "@/lib/whatsapp-window";
import { ErrorNote, Modal } from "../ui/Page";
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
  const [requestingPayment, setRequestingPayment] = useState(false);

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
          key={conversation.id}
          contact={{
            name: conversation.contact.name,
            email: conversation.contact.email,
            waId: conversation.externalId,
            attributes: conversation.contact.attributes,
          }}
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
              <div className="flex gap-1">
                <button className="btn flex-1" onClick={() => setUseTemplate(true)}>
                  Template
                </button>
                <button className="btn px-2" title="Request a payment" aria-label="Request a payment" onClick={() => setRequestingPayment(true)}>
                  <IndianRupee size={15} />
                </button>
              </div>
            )}
            <button className="btn-primary" disabled={sending || !text.trim()} onClick={sendText}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
      {requestingPayment && <RequestPaymentDialog conversationId={conversation.id} onClose={() => setRequestingPayment(false)} />}
    </div>
  );
}

/** Create a Razorpay link and send it in this chat (the 24h window is open here). */
function RequestPaymentDialog({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState(72);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/payments", { conversationId, amount, description, expiresInHours: hours });
      onClose(); // the message appears in the chat by itself
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the payment link");
      setBusy(false);
    }
  }

  return (
    <Modal title="Request a payment" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-title">Amount (₹)</span>
            <input className="input mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1499" autoFocus />
          </label>
          <label className="block">
            <span className="field-title">Link expires after</span>
            <select className="input mt-1" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={24}>1 day</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="field-title">What it&apos;s for</span>
          <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Course fee – October batch" />
        </label>
        <p className="text-xs text-slate-500">They get a WhatsApp message with a secure Razorpay link. You&apos;ll see it marked paid under Payments.</p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!amount || !description.trim() || busy} onClick={send}>
            {busy ? "Sending…" : "Send payment link"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
