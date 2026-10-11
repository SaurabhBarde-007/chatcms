import { describe, expect, it } from "vitest";
import {
  applyEventToList,
  applyEventToThread,
  clearUnread,
  filtersToQuery,
  mergeMessage,
  NO_FILTERS,
  upsertMessage,
} from "../inbox-state";
import type { ConversationDetailDTO, ConversationSummaryDTO, InboxEvent, MessageDTO } from "../types";

function conv(id: string, lastMessageAt: string, extra: Partial<ConversationSummaryDTO> = {}): ConversationSummaryDTO {
  return {
    id,
    channel: "WHATSAPP",
    status: "HUMAN",
    externalId: `ext-${id}`,
    contact: { id: `contact-${id}`, name: id, phone: null, email: null, optInStatus: "UNKNOWN", tags: [] },
    lastMessageAt,
    lastMessageText: null,
    lastInboundAt: null,
    unreadCount: 0,
    ...extra,
  };
}

function msg(id: string, createdAt: string, extra: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id,
    conversationId: "a",
    direction: "OUT",
    senderType: "HUMAN",
    type: "text",
    body: id,
    mediaSrc: null,
    mimeType: null,
    status: "SENT",
    error: null,
    createdAt,
    ...extra,
  };
}

const T1 = "2026-10-05T10:00:00.000Z";
const T2 = "2026-10-05T10:01:00.000Z";
const T3 = "2026-10-05T10:02:00.000Z";

describe("applyEventToList", () => {
  const list = [conv("b", T2), conv("a", T1)];

  it("moves an updated conversation to the top", () => {
    const event: InboxEvent = { type: "conversation", conversation: conv("a", T3, { unreadCount: 1 }) };
    const next = applyEventToList(list, event, NO_FILTERS)!;
    expect(next.map((c) => c.id)).toEqual(["a", "b"]);
    expect(next[0].unreadCount).toBe(1);
  });

  it("adds new conversations and is idempotent", () => {
    const event: InboxEvent = { type: "conversation", conversation: conv("c", T3) };
    const once = applyEventToList(list, event, NO_FILTERS)!;
    const twice = applyEventToList(once, event, NO_FILTERS)!;
    expect(twice.map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("drops a conversation that stops matching the filters", () => {
    const filters = { ...NO_FILTERS, status: "HUMAN" as const };
    const event: InboxEvent = { type: "conversation", conversation: conv("a", T3, { status: "CLOSED" }) };
    expect(applyEventToList(list, event, filters)!.map((c) => c.id)).toEqual(["b"]);
  });

  it("ignores conversations from other channels when filtered", () => {
    const filters = { ...NO_FILTERS, channel: "WEB_BOT" as const };
    const event: InboxEvent = { type: "conversation", conversation: conv("c", T3) };
    expect(applyEventToList([], event, filters)).toEqual([]);
  });

  it("leaves an unloaded list alone", () => {
    expect(applyEventToList(null, { type: "conversation", conversation: conv("a", T1) }, NO_FILTERS)).toBeNull();
  });
});

describe("applyEventToThread", () => {
  const thread: ConversationDetailDTO = { ...conv("a", T1), messages: [msg("m1", T1)] };

  it("appends new messages to the open thread and updates its summary", () => {
    const event: InboxEvent = {
      type: "message",
      message: msg("m2", T2, { direction: "IN", senderType: "CUSTOMER" }),
      conversation: conv("a", T2, { status: "HUMAN", unreadCount: 1 }),
    };
    const next = applyEventToThread(thread, event)!;
    expect(next.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(next.lastMessageAt).toBe(T2);
    expect(next.unreadCount).toBe(1);
  });

  it("ignores events for other conversations", () => {
    const event: InboxEvent = { type: "message", message: msg("x", T2), conversation: conv("other", T2) };
    expect(applyEventToThread(thread, event)).toBe(thread);
  });
});

describe("upsertMessage / mergeMessage", () => {
  it("keeps messages in time order even if one arrives late", () => {
    const next = upsertMessage([msg("m1", T1), msg("m3", T3)], msg("m2", T2));
    expect(next.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("updates in place by id (reply via HTTP + stream = one bubble)", () => {
    const next = upsertMessage([msg("m1", T1, { status: "PENDING" })], msg("m1", T1, { status: "SENT" }));
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("SENT");
  });

  it("never moves delivery status backwards", () => {
    const merged = mergeMessage(msg("m1", T1, { status: "READ" }), msg("m1", T1, { status: "SENT" }));
    expect(merged.status).toBe("READ");
    expect(mergeMessage(msg("m1", T1, { status: "SENT" }), msg("m1", T1, { status: "FAILED", error: "x" }))).toMatchObject({
      status: "FAILED",
      error: "x",
    });
  });
});

describe("helpers", () => {
  it("clearUnread only touches the matching conversation", () => {
    const a = conv("a", T1, { unreadCount: 3 });
    expect(clearUnread(a, "a").unreadCount).toBe(0);
    expect(clearUnread(a, "b")).toBe(a);
  });

  it("filtersToQuery skips empty values", () => {
    expect(filtersToQuery(NO_FILTERS)).toBe("");
    expect(filtersToQuery({ channel: "WHATSAPP", status: "", q: "  priya " })).toBe("channel=WHATSAPP&q=priya");
  });
});
