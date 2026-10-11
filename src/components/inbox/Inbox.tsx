"use client";

import { useInbox } from "@/hooks/useInbox";
import { ConnectionBadge } from "./Badges";
import { ChatThread } from "./ChatThread";
import { ContactPanel } from "./ContactPanel";
import { ConversationList } from "./ConversationList";

/** The three-pane inbox: conversation list | messages | contact details. Updates live. */
export function Inbox() {
  const inbox = useInbox();
  const { selectedId, thread } = inbox;

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* On phones only one pane is visible at a time. */}
        <aside
          className={`w-full shrink-0 border-r border-slate-200 bg-white md:flex md:w-80 ${selectedId ? "hidden" : "flex"}`}
        >
          <ConversationList
            connection={<ConnectionBadge status={inbox.connection} />}
            conversations={inbox.list}
            error={inbox.listError}
            filters={inbox.filters}
            onFiltersChange={inbox.setFilters}
            selectedId={selectedId}
            onSelect={inbox.select}
          />
        </aside>

        <main className={`min-w-0 flex-1 flex-col md:flex ${selectedId ? "flex" : "hidden"}`}>
          {thread ? (
            <ChatThread
              key={thread.id}
              conversation={thread}
              onBack={() => inbox.select(null)}
              onReplySent={inbox.onReplySent}
              onChanged={inbox.refreshIfOffline}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              {selectedId ? (inbox.threadError ?? "Loading…") : "Select a conversation"}
            </div>
          )}
        </main>

        {thread && (
          <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white lg:block">
            <ContactPanel conversation={thread} />
          </aside>
        )}
      </div>
    </div>
  );
}
