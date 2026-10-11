"use client";

import { type ReactNode, useEffect, useState } from "react";
import { CHATBOT_ENABLED, ENABLED_CHANNELS } from "@/lib/enabled-channels";
import { CHANNEL_LABEL, contactName, shortTime } from "@/lib/format";
import type { Filters } from "@/lib/inbox-state";
import type { ConversationSummaryDTO } from "@/lib/types";
import { ChannelBadge, STATUS_LABEL, StatusBadge } from "./Badges";

type Props = {
  /** Live-connection indicator shown above the search box. */
  connection: ReactNode;
  conversations: ConversationSummaryDTO[] | null;
  error: string | null;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// Channel chips only appear when there's more than one channel to choose from.
const CHANNEL_OPTIONS: { value: Filters["channel"]; label: string }[] =
  ENABLED_CHANNELS.length > 1
    ? [{ value: "", label: "All" }, ...ENABLED_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))]
    : [];

const STATUS_OPTIONS: { value: Filters["status"]; label: string }[] = [
  { value: "", label: "Any status" },
  ...(CHATBOT_ENABLED ? [{ value: "BOT" as const, label: STATUS_LABEL.BOT }] : []),
  { value: "HUMAN", label: STATUS_LABEL.HUMAN },
  { value: "CLOSED", label: STATUS_LABEL.CLOSED },
];

export function ConversationList({ connection, conversations, error, filters, onFiltersChange, selectedId, onSelect }: Props) {
  // Wait until typing pauses before searching, so we don't query on every keystroke.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== filters.q) onFiltersChange({ ...filters, q: search });
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters, onFiltersChange]);

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="space-y-2 border-b border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Conversations</span>
          {connection}
        </div>
        <input
          className="input"
          type="search"
          placeholder="Search name, phone, message…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {CHANNEL_OPTIONS.map((o) => (
            <button
              key={o.label}
              className={`chip ${filters.channel === o.value ? "chip-active" : ""}`}
              onClick={() => onFiltersChange({ ...filters, channel: o.value })}
            >
              {o.label}
            </button>
          ))}
          <select
            className="ml-auto rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
            value={filters.status}
            aria-label="Filter by status"
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value as Filters["status"] })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {error && <li className="p-4 text-sm text-red-600">{error}</li>}
        {!conversations && !error && <li className="p-4 text-sm text-slate-400">Loading…</li>}
        {conversations?.length === 0 && <li className="p-4 text-sm text-slate-400">No conversations yet</li>}

        {conversations?.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`block w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 ${
                c.id === selectedId ? "bg-slate-100" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${c.unreadCount ? "font-semibold" : "font-medium"}`}>
                  {contactName(c.contact)}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{shortTime(c.lastMessageAt)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className={`truncate text-xs ${c.unreadCount ? "text-slate-800" : "text-slate-500"}`}>
                  {c.lastMessageText}
                </span>
                {c.unreadCount > 0 && (
                  <span className="shrink-0 rounded-full bg-green-600 px-1.5 text-[11px] font-semibold text-white">
                    {c.unreadCount}
                  </span>
                )}
              </div>
              <div className="mt-1 flex gap-1">
                <ChannelBadge channel={c.channel} />
                <StatusBadge status={c.status} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
