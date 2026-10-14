import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook } from "../channels/whatsapp";
import { consentSourceLabel } from "../format";
import { optOutSourceFor } from "../marketing/consent";

describe("opting out from WhatsApp signals", () => {
  it("maps delivery errors to opt-outs", () => {
    expect(optOutSourceFor(131050)).toBe("whatsapp"); // stopped marketing messages from you
    expect(optOutSourceFor(131026)).toBeNull(); // undeliverable (maybe blocked): consent unchanged
    expect(optOutSourceFor(131049)).toBeNull(); // Meta's marketing frequency limit: not their choice
    expect(optOutSourceFor(131047)).toBeNull(); // 24h window closed
    expect(optOutSourceFor(undefined)).toBeNull();
  });

  it("reads the user_preferences webhook", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "user_preferences",
              value: {
                messaging_product: "whatsapp",
                contacts: [{ wa_id: "919812345678" }],
                user_preferences: [
                  { wa_id: "919812345678", detail: "User requested to stop marketing messages", category: "marketing_messages", value: "stop", timestamp: 1731705721 },
                  { wa_id: "919800000001", category: "marketing_messages", value: "resume", timestamp: 1731705800 },
                  { wa_id: "919800000002", category: "something_else", value: "stop" },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseWhatsAppWebhook(payload).preferences).toEqual([
      { waId: "919812345678", value: "stop", timestamp: new Date(1731705721_000) },
      { waId: "919800000001", value: "resume", timestamp: new Date(1731705800_000) },
    ]);
  });

  it("explains why someone is opted in or out", () => {
    expect(consentSourceLabel("keyword", "OPTED_OUT")).toBe("Replied STOP");
    expect(consentSourceLabel("whatsapp", "OPTED_OUT")).toBe("Stopped marketing in WhatsApp");
    expect(consentSourceLabel("whatsapp", "OPTED_IN")).toBe("Resumed marketing in WhatsApp");
    expect(consentSourceLabel(null)).toBeNull();
  });
});
