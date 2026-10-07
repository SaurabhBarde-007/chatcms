"use client";

import { useEffect, useRef } from "react";
import { contactName } from "@/lib/format";
import type { ConversationDetailDTO, MessageDTO } from "@/lib/types";
import { ChannelBadge, StatusBadge } from "./Badges";
import { Composer } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import { StatusActions } from "./StatusActions";

type Props = {
  conversation: ConversationDetailDTO;
  onBack: () => void;
  onReplySent: (message: MessageDTO) => void;
  onChanged: () => void;
};

// "Near the bottom" = within this many pixels. New messages only auto-scroll
// if you're already there, so reading older messages isn't interrupted.
const STICKY_BOTTOM_PX = 120;

export function ChatThread({ conversation, onBack, onReplySent, onChanged }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const { messages } = conversation;
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    const el = scrollRef.current;
    if (el && (atBottomRef.current || lastMessage?.senderType === "HUMAN")) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, lastMessage?.senderType]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_BOTTOM_PX;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <button onClick={onBack} className="btn md:hidden" aria-label="Back to list">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{contactName(conversation.contact)}</div>
          <div className="mt-0.5 flex gap-1">
            <ChannelBadge channel={conversation.channel} />
            <StatusBadge status={conversation.status} />
          </div>
        </div>
        <StatusActions conversation={conversation} onChanged={onChanged} />
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-100 p-4">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <Composer
        conversation={conversation}
        onSent={(message) => {
          onReplySent(message);
          onChanged();
        }}
      />
    </div>
  );
}
