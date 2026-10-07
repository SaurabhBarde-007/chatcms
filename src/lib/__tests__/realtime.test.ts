import { describe, expect, it } from "vitest";
import { botIngestSchema, botPayloadToInbound } from "../channels/webbot";
import { toDirectUrl } from "../database-url";
import { isStatusAdvance } from "../message-status";
import { parseNotice } from "../realtime/hydrate";
import { formatRetry, formatSSE, SSE_PING } from "../realtime/sse";
import { isWindowOpen, WINDOW_MS } from "../whatsapp-window";

describe("SSE format", () => {
  it("writes one event per block, data on a single line", () => {
    expect(formatSSE("inbox", { text: "line1\nline2" })).toBe('event: inbox\ndata: {"text":"line1\\nline2"}\n\n');
    expect(formatSSE("ready")).toBe("event: ready\ndata: {}\n\n");
    expect(SSE_PING).toBe(": ping\n\n");
    expect(formatRetry(3000)).toBe("retry: 3000\n\n");
  });
});

describe("parseNotice", () => {
  it("accepts message and conversation notices only", () => {
    expect(parseNotice('{"kind":"message","id":"m1"}')).toEqual({ kind: "message", id: "m1" });
    expect(parseNotice('{"kind":"conversation","id":"c1"}')).toEqual({ kind: "conversation", id: "c1" });
    expect(parseNotice('{"kind":"other","id":"x"}')).toBeNull();
    expect(parseNotice('{"kind":"message"}')).toBeNull();
    expect(parseNotice("not json")).toBeNull();
    expect(parseNotice(undefined)).toBeNull();
  });
});

describe("isStatusAdvance", () => {
  it("only moves forward, except FAILED which always applies once", () => {
    expect(isStatusAdvance("PENDING", "SENT")).toBe(true);
    expect(isStatusAdvance("SENT", "READ")).toBe(true);
    expect(isStatusAdvance("READ", "DELIVERED")).toBe(false);
    expect(isStatusAdvance("SENT", "SENT")).toBe(false);
    expect(isStatusAdvance("DELIVERED", "FAILED")).toBe(true);
    expect(isStatusAdvance("FAILED", "FAILED")).toBe(false);
  });
});

describe("isWindowOpen", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  it("is open for 24h after the customer's last message", () => {
    expect(isWindowOpen(new Date(now - WINDOW_MS + 1000), now)).toBe(true);
    expect(isWindowOpen(new Date(now - WINDOW_MS - 1000), now)).toBe(false);
    expect(isWindowOpen(null, now)).toBe(false);
  });
});

describe("bot ingest payload", () => {
  it("validates and prefixes the message id", () => {
    const parsed = botIngestSchema.parse({
      conversationId: "sess_1",
      message: { id: "m1", senderType: "CUSTOMER", text: "hi" },
    });
    const inbound = botPayloadToInbound(parsed);
    expect(inbound).toMatchObject({
      channel: "WEB_BOT",
      conversationExternalId: "sess_1",
      contact: {},
      message: { externalId: "bot:m1", senderType: "CUSTOMER", type: "text", body: "hi" },
    });
  });

  it("rejects bad payloads", () => {
    expect(botIngestSchema.safeParse({ conversationId: "x", message: { id: "1", senderType: "HUMAN" } }).success).toBe(
      false,
    );
    expect(
      botIngestSchema.safeParse({ conversationId: "x", message: { id: "1", senderType: "BOT", mediaUrl: "nope" } })
        .success,
    ).toBe(false);
  });
});

describe("toDirectUrl", () => {
  it("drops Neon's pooler from the host and leaves other URLs alone", () => {
    expect(toDirectUrl("postgresql://u:p@ep-cool-1-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require")).toBe(
      "postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/neondb?sslmode=require",
    );
    expect(toDirectUrl("postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/neondb")).toBe(
      "postgresql://u:p@ep-cool-1.us-east-2.aws.neon.tech/neondb",
    );
    expect(toDirectUrl("postgresql://localhost:5432/db")).toBe("postgresql://localhost:5432/db");
  });
});
