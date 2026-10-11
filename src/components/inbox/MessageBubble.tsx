import { fullTime, shortTime } from "@/lib/format";
import type { MessageDTO } from "@/lib/types";

const BUBBLE_STYLE: Record<MessageDTO["senderType"], string> = {
  CUSTOMER: "bg-white border border-slate-200 text-slate-900",
  BOT: "bg-violet-50 border border-violet-200 text-slate-900",
  HUMAN: "bg-emerald-600 text-white",
  CAMPAIGN: "bg-sky-50 border border-sky-200 text-slate-900",
};

const SENDER_LABEL: Record<MessageDTO["senderType"], string | null> = {
  CUSTOMER: null,
  BOT: "Bot",
  HUMAN: "You",
  CAMPAIGN: "Campaign",
};

export function MessageBubble({ message }: { message: MessageDTO }) {
  const outgoing = message.direction === "OUT";
  const label = SENDER_LABEL[message.senderType];

  return (
    <div className={`flex ${outgoing ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${BUBBLE_STYLE[message.senderType]}`}>
        {label && <div className="mb-0.5 text-[11px] font-semibold opacity-70">{label}</div>}

        <MessageMedia message={message} />
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}

        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-70" title={fullTime(message.createdAt)}>
          {shortTime(message.createdAt)}
          {(message.senderType === "HUMAN" || message.senderType === "CAMPAIGN") && (
            <DeliveryStatus status={message.status} />
          )}
        </div>
        {message.status === "FAILED" && (
          <p className="mt-1 rounded bg-red-100 px-2 py-1 text-xs text-red-700">Not delivered: {message.error}</p>
        )}
      </div>
    </div>
  );
}

function MessageMedia({ message }: { message: MessageDTO }) {
  const src = message.mediaSrc;
  if (!src) return null;

  switch (message.type) {
    case "image":
    case "sticker":
      // eslint-disable-next-line @next/next/no-img-element -- media comes from our own proxy or your bot
      return <img src={src} alt="" className="mb-1 max-h-64 rounded" />;
    case "video":
      return <video src={src} controls className="mb-1 max-h-64 rounded" />;
    case "audio":
      return <audio src={src} controls className="mb-1" />;
    default:
      return (
        <a href={src} target="_blank" rel="noreferrer" className="mb-1 block underline">
          📎 Open attachment
        </a>
      );
  }
}

function DeliveryStatus({ status }: { status: MessageDTO["status"] }) {
  switch (status) {
    case "PENDING":
      return <span title="Sending">🕓</span>;
    case "SENT":
      return <span title="Sent">✓</span>;
    case "DELIVERED":
      return <span title="Delivered">✓✓</span>;
    case "READ":
      return (
        <span title="Read" className="font-bold text-sky-300">
          ✓✓
        </span>
      );
    case "FAILED":
      return <span title="Failed">⚠️</span>;
  }
}
