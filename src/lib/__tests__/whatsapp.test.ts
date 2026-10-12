import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook, templateBodyParams } from "../channels/whatsapp";

// Trimmed-down copies of real Meta webhook payloads.
const wrap = (value: object) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA_ID", changes: [{ field: "messages", value }] }],
});

const inbound = wrap({
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
  contacts: [{ profile: { name: "Priya" }, wa_id: "919812345678" }],
  messages: [
    { from: "919812345678", id: "wamid.TXT", timestamp: "1727430000", type: "text", text: { body: "Hello there" } },
    {
      from: "919812345678",
      id: "wamid.IMG",
      timestamp: "1727430005",
      type: "image",
      image: { id: "MEDIA_1", mime_type: "image/jpeg", caption: "my receipt" },
    },
    {
      from: "919812345678",
      id: "wamid.DOC",
      timestamp: "1727430006",
      type: "document",
      document: { id: "MEDIA_2", mime_type: "application/pdf", filename: "invoice.pdf" },
    },
    {
      from: "919812345678",
      id: "wamid.LOC",
      timestamp: "1727430007",
      type: "location",
      location: { latitude: 19.07, longitude: 72.87, name: "Office" },
    },
    {
      from: "919812345678",
      id: "wamid.BTN",
      timestamp: "1727430008",
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "yes", title: "Yes please" } },
    },
    { from: "919812345678", id: "wamid.TPL", timestamp: "1727430009", type: "button", button: { text: "Stop" } },
    { from: "919812345678", id: "wamid.RCT", timestamp: "1727430010", type: "reaction", reaction: { emoji: "👍" } },
    { from: "919812345678", id: "wamid.UNK", timestamp: "1727430011", type: "order" },
  ],
});

const statuses = wrap({
  statuses: [
    { id: "wamid.OUT1", status: "delivered", timestamp: "1727430100", recipient_id: "919812345678" },
    { id: "wamid.OUT2", status: "read", timestamp: "1727430101", recipient_id: "919812345678" },
    {
      id: "wamid.OUT3",
      status: "failed",
      errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "Window closed" } }],
    },
    { id: "wamid.OUT4", status: "deleted" },
  ],
});

describe("parseWhatsAppWebhook", () => {
  it("normalizes inbound messages of every type", () => {
    const { messages, statuses } = parseWhatsAppWebhook(inbound);
    expect(statuses).toHaveLength(0);

    expect(messages[0]).toMatchObject({
      channel: "WHATSAPP",
      conversationExternalId: "919812345678",
      contact: { name: "Priya", phone: "+919812345678" },
      message: { externalId: "wamid.TXT", senderType: "CUSTOMER", type: "text", body: "Hello there" },
    });
    expect(messages[0].message.timestamp?.toISOString()).toBe("2024-09-27T09:40:00.000Z");

    const byId = Object.fromEntries(messages.map((m) => [m.message.externalId, m.message]));
    expect(byId["wamid.IMG"]).toMatchObject({ type: "image", mediaId: "MEDIA_1", mimeType: "image/jpeg", body: "my receipt" });
    expect(byId["wamid.DOC"]).toMatchObject({ type: "document", mediaId: "MEDIA_2", body: "invoice.pdf" });
    expect(byId["wamid.LOC"]).toMatchObject({ type: "location", body: "Office — 19.07,72.87" });
    expect(byId["wamid.BTN"]).toMatchObject({ type: "interactive", body: "Yes please" });
    expect(byId["wamid.TPL"]).toMatchObject({ type: "button", body: "Stop" });
    expect(byId["wamid.RCT"]).toMatchObject({ type: "reaction", body: "Reacted 👍" });
    expect(byId["wamid.UNK"]).toMatchObject({ type: "other", body: "[Unsupported message type: order]" });
  });

  it("normalizes delivery statuses and skips unknown ones", () => {
    const result = parseWhatsAppWebhook(statuses);
    expect(result.messages).toHaveLength(0);
    expect(result.statuses).toEqual([
      { externalId: "wamid.OUT1", status: "DELIVERED", error: undefined, errorCode: undefined, timestamp: new Date(1727430100_000) },
      { externalId: "wamid.OUT2", status: "READ", error: undefined, errorCode: undefined, timestamp: new Date(1727430101_000) },
      { externalId: "wamid.OUT3", status: "FAILED", error: "Window closed", errorCode: 131047, timestamp: undefined },
    ]);
  });

  it("ignores junk payloads", () => {
    expect(parseWhatsAppWebhook({})).toEqual({ messages: [], statuses: [] });
    expect(parseWhatsAppWebhook(null)).toEqual({ messages: [], statuses: [] });
  });
});

describe("templateBodyParams", () => {
  it("lists distinct numbered placeholders in sending order", () => {
    expect(templateBodyParams("Hi {{2}}, your order {{1}} ships {{2}}")).toEqual({ params: ["1", "2"], named: false });
    expect(templateBodyParams("No params")).toEqual({ params: [], named: false });
  });

  it("keeps named placeholders by name, in order of appearance", () => {
    expect(templateBodyParams("Hi {{first_name}}, class {{class}} at {{school}}", "NAMED")).toEqual({
      params: ["first_name", "class", "school"],
      named: true,
    });
    expect(templateBodyParams("Hi {{first_name}}").named).toBe(true);
  });
});
