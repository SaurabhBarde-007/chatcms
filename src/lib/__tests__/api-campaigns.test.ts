import { describe, expect, it } from "vitest";
import { tierLimit } from "../marketing/account";
import { containsKeyword, matchingCampaigns, parseTrigger } from "../marketing/api-campaigns";
import { applyParams, consentProblem } from "../marketing/campaign-runner";
import { estimateCost, toCsv } from "../marketing/campaigns";
import { parseTemplate, type TemplateVariables } from "../marketing/templates";
import { formatCurrency } from "../format";
import { DEFAULT_PRICING } from "../settings";

describe("auto-reply matching", () => {
  it("matches keywords as words or phrases, ignoring case and punctuation", () => {
    expect(containsKeyword("What's the PRICE?", ["price"])).toBe(true);
    expect(containsKeyword("send the pricelist", ["price"])).toBe(false);
    expect(containsKeyword("I want to book a demo please", ["book a demo"])).toBe(true);
    expect(containsKeyword("hello", [])).toBe(false);
  });

  const at = (d: string) => new Date(d);
  const c = (id: string, match: "ANY" | "FIRST_MESSAGE" | "KEYWORDS", created: string, keywords: string[] = [], enabled = true) => ({
    id,
    createdAt: at(created),
    trigger: { incoming: { enabled, match, keywords, cooldownHours: 24 } },
  });
  const campaigns = [
    c("any", "ANY", "2026-01-01"),
    c("first", "FIRST_MESSAGE", "2026-01-02"),
    c("price", "KEYWORDS", "2026-01-03", ["price", "fees"]),
    c("off", "ANY", "2025-12-01", [], false),
  ];

  it("prefers keywords, then first message, then any message", () => {
    expect(matchingCampaigns(campaigns, { text: "what are the fees", isFirstMessage: true }).map((x) => x.id)).toEqual(["price", "first", "any"]);
    expect(matchingCampaigns(campaigns, { text: "hi", isFirstMessage: true }).map((x) => x.id)).toEqual(["first", "any"]);
    expect(matchingCampaigns(campaigns, { text: "hi", isFirstMessage: false }).map((x) => x.id)).toEqual(["any"]);
  });

  it("treats a broken trigger as switched off", () => {
    expect(parseTrigger({ nope: true }).incoming.enabled).toBe(false);
  });
});

describe("sending rules", () => {
  const promo = parseTemplate({
    name: "p", language: "en", category: "MARKETING",
    components: [
      { type: "HEADER", format: "TEXT", text: "For {{1}}" },
      { type: "BODY", text: "Hi {{1}}, use {{2}}." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Open", url: "https://x.com/{{1}}" }] },
    ],
  });
  const vars: TemplateVariables = { header: {}, body: { "1": { from: "contact", field: "first_name", fallback: "there" } }, buttons: {} };

  it("applies per-send API values to body, header, URL button and media", () => {
    const next = applyParams(promo, vars, { "2": "SAVE10", header: "VIPs", url: "abc", mediaUrl: "https://cdn/x.jpg" });
    expect(next.body["2"]).toEqual({ from: "text", value: "SAVE10" });
    expect(next.body["1"]).toEqual(vars.body["1"]);
    expect(next.header["1"]).toEqual({ from: "text", value: "VIPs" });
    expect(next.buttons["0"]["1"]).toEqual({ from: "text", value: "abc" });
    expect(next.headerMediaUrl).toBe("https://cdn/x.jpg");
  });

  it("maps 'code' to the OTP body value", () => {
    expect(applyParams(promo, vars, { code: "482913" }).body["1"]).toEqual({ from: "text", value: "482913" });
  });

  it("broadcasts need opt-in; API campaigns only respect marketing opt-outs", () => {
    const unknown = { waId: "919800000000", optInStatus: "UNKNOWN" as const };
    const out = { waId: "919800000000", optInStatus: "OPTED_OUT" as const };
    expect(consentProblem({ type: "BROADCAST" }, "MARKETING", unknown)).toMatch(/Not opted in/);
    expect(consentProblem({ type: "API" }, "MARKETING", unknown)).toBeNull();
    expect(consentProblem({ type: "API" }, "MARKETING", out)).toMatch(/Opted out/);
    expect(consentProblem({ type: "API" }, "UTILITY", out)).toBeNull();
    expect(consentProblem({ type: "API" }, "UTILITY", { waId: null, optInStatus: "OPTED_IN" })).toBe("No WhatsApp number");
  });
});

describe("costs", () => {
  it("formats estimated costs", () => {
    expect(formatCurrency(1499.5)).toBe("₹1,499.50");
    expect(formatCurrency(99)).toBe("₹99");
    expect(formatCurrency(0.8631)).toBe("₹0.86");
  });
});

describe("reports & numbers", () => {
  it("writes CSV safely (quotes, formulas)", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", null, 3]])).toBe('﻿"a,b","say ""hi""",\'=SUM(A1),,3\r\n');
  });

  it("estimates cost by category", () => {
    expect(estimateCost(100, "MARKETING", DEFAULT_PRICING)).toBe(86.31);
    expect(estimateCost(100, "UTILITY", DEFAULT_PRICING)).toBe(11.5);
  });

  it("reads messaging tiers", () => {
    expect(tierLimit("TIER_250")).toBe(250);
    expect(tierLimit("TIER_10K")).toBe(10_000);
    expect(tierLimit("TIER_UNLIMITED")).toBeNull();
    expect(tierLimit(null)).toBeNull();
  });
});
