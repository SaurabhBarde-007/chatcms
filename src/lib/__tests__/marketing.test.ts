import { describe, expect, it } from "vitest";
import { WhatsAppApiError } from "../channels/whatsapp";
import { classifySendError } from "../marketing/campaign-runner";
import { mapCsvRows, normalizeHeader, parseCsv } from "../marketing/csv";
import { isOptOutMessage } from "../marketing/opt-out";
import { normalizeWaId } from "../marketing/phone";
import { describeRules, segmentRulesSchema, segmentWhere } from "../marketing/segments";

describe("normalizeWaId", () => {
  it("accepts international formats", () => {
    expect(normalizeWaId("+91 98123-45678")).toBe("919812345678");
    expect(normalizeWaId("0091 98123 45678")).toBe("919812345678");
    expect(normalizeWaId("919812345678")).toBe("919812345678");
    expect(normalizeWaId(919812345678)).toBe("919812345678");
  });
  it("adds the default country code to local numbers", () => {
    expect(normalizeWaId("98123 45678", "91")).toBe("919812345678");
    expect(normalizeWaId("098123 45678", "91")).toBe("919812345678");
    expect(normalizeWaId("+1 650 555 1234", "91")).toBe("16505551234");
  });
  it("rejects junk", () => {
    expect(normalizeWaId("12345")).toBeNull();
    expect(normalizeWaId("")).toBeNull();
    expect(normalizeWaId(null)).toBeNull();
    expect(normalizeWaId("1234567890123456")).toBeNull();
  });
});

describe("isOptOutMessage", () => {
  it("matches whole-message opt-out phrases", () => {
    for (const t of ["STOP", "stop.", " Unsubscribe ", "Stop promotions", "opt-out"]) expect(isOptOutMessage(t)).toBe(true);
  });
  it("ignores normal messages", () => {
    for (const t of ["please stop by tomorrow", "don't stop", "", null]) expect(isOptOutMessage(t)).toBe(false);
  });
});

describe("CSV import mapping", () => {
  const csv = [
    "﻿Phone Number,First Name,Last Name,E-mail,Tags,Opted In,City",
    '+91 98123 45678,Asha,Sharma,asha@example.com,"VIP; diwali",yes,Pune',
    "98111 22233,Ravi,,,,no,Mumbai",
    "12,Bad,,,,,",
    ",Nobody,,,,,",
    "919812345678,,,,gold,,",
  ].join("\n");

  it("normalizes headers", () => {
    expect(normalizeHeader(" Phone Number ")).toBe("phone_number");
    expect(normalizeHeader("﻿E-mail")).toBe("e_mail");
  });

  it("maps, validates and merges rows", () => {
    const { rows, problems } = mapCsvRows(parseCsv(csv), { defaultCountryCode: "91", addTags: ["import"] });
    expect(rows).toEqual([
      {
        waId: "919812345678",
        name: "Asha Sharma",
        email: "asha@example.com",
        tags: ["vip", "diwali", "import", "gold"],
        optedIn: true,
        attributes: { city: "Pune" },
      },
      { waId: "919811122233", name: "Ravi", email: undefined, tags: ["import"], optedIn: false, attributes: { city: "Mumbai" } },
    ]);
    expect(problems).toEqual([
      { line: 4, reason: '"12" isn\'t a valid phone number (include the country code)' },
      { line: 5, reason: "No phone number" },
    ]);
  });
});

describe("segments", () => {
  const now = Date.parse("2026-10-09T00:00:00Z");

  it("always limits to reachable contacts", () => {
    expect(segmentWhere(segmentRulesSchema.parse({}), now)).toEqual({
      AND: [{ optInStatus: "OPTED_IN", waId: { not: null } }],
    });
  });

  it("compiles every rule", () => {
    const rules = segmentRulesSchema.parse({
      tagsAny: ["vip"],
      tagsNone: ["churned"],
      activeWithinDays: 30,
      countryCodes: ["91", "971"],
    });
    expect(segmentWhere(rules, now)).toEqual({
      AND: [
        { optInStatus: "OPTED_IN", waId: { not: null } },
        { tags: { hasSome: ["vip"] } },
        { NOT: { tags: { hasSome: ["churned"] } } },
        { conversations: { some: { channel: "WHATSAPP", lastInboundAt: { gte: new Date("2026-09-09T00:00:00Z") } } } },
        { OR: [{ waId: { startsWith: "91" } }, { waId: { startsWith: "971" } }] },
      ],
    });
    expect(describeRules(rules)).toBe("Tagged vip · not tagged churned · active in last 30 days · +91, +971");
  });

  it("rejects bad country codes", () => {
    expect(segmentRulesSchema.safeParse({ countryCodes: ["+91"] }).success).toBe(false);
  });
});

describe("classifySendError", () => {
  it("stops the campaign on errors that affect every message", () => {
    expect(classifySendError(new WhatsAppApiError("Session has expired", 190)).kind).toBe("fatal");
    expect(classifySendError(new WhatsAppApiError("Template paused", 132015)).kind).toBe("fatal");
  });
  it("slows down on rate limits", () => {
    expect(classifySendError(new WhatsAppApiError("Rate limit hit", 130429)).kind).toBe("retry");
  });
  it("fails just the recipient otherwise (incl. network errors — no blind retries)", () => {
    expect(classifySendError(new WhatsAppApiError("Undeliverable", 131026))).toEqual({ kind: "recipient", code: 131026, message: "Undeliverable" });
    expect(classifySendError(new TypeError("fetch failed")).kind).toBe("recipient");
  });
});
