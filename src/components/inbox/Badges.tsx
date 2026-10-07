import type { ConnectionStatus } from "@/hooks/useInboxStream";
import { CHATBOT_ENABLED, ENABLED_CHANNELS } from "@/lib/enabled-channels";
import { CHANNEL_LABEL } from "@/lib/format";
import type { ChannelName, ConversationStatusName } from "@/lib/types";

const CHANNEL_STYLE: Record<ChannelName, string> = {
  WEB_BOT: "bg-blue-100 text-blue-700",
  WHATSAPP: "bg-green-100 text-green-700",
};

export function ChannelBadge({ channel }: { channel: ChannelName }) {
  if (ENABLED_CHANNELS.length < 2) return null; // nothing to tell apart
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CHANNEL_STYLE[channel]}`}>
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

const STATUS_STYLE: Record<ConversationStatusName, string> = {
  BOT: "bg-violet-100 text-violet-700",
  HUMAN: "bg-amber-100 text-amber-800",
  CLOSED: "bg-slate-200 text-slate-600",
};

export const STATUS_LABEL: Record<ConversationStatusName, string> = {
  BOT: "Bot replying",
  // With a bot, HUMAN means "you took over"; without one, it's just an open conversation.
  HUMAN: CHATBOT_ENABLED ? "You" : "Open",
  CLOSED: "Closed",
};

export function StatusBadge({ status }: { status: ConversationStatusName }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const CONNECTION: Record<ConnectionStatus, { label: string; dot: string; hint: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", hint: "New messages appear instantly" },
  connecting: { label: "Connecting…", dot: "bg-slate-400 animate-pulse", hint: "Opening the live connection" },
  reconnecting: {
    label: "Reconnecting…",
    dot: "bg-amber-500 animate-pulse",
    hint: "Live updates paused; everything will be refreshed once reconnected",
  },
};

/** Shows whether the real-time stream is connected. */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const c = CONNECTION[status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500" title={c.hint} role="status">
      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
