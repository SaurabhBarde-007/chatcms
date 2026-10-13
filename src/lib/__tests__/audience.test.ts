import { describe, expect, it } from "vitest";
import { type AudienceFilter, audienceFilterSchema, describeAudience, describeFilter, parseAudience, requiresOptIn } from "../marketing/audience";
import { AudienceError, audienceCondition } from "../marketing/audience-query";
import { consentProblem } from "../marketing/campaign-runner";

const noSegments = { segment: { findMany: async () => [] } } as never;
const sqlOf = async (filters: AudienceFilter[], client = noSegments) => {
  const q = await audienceCondition(filters, Date.parse("2026-10-13T00:00:00Z"), client);
  return { text: q.text.replace(/\s+/g, " "), values: q.values };
};

describe("audience filters", () => {
  it("validates filters", () => {
    expect(audienceFilterSchema.safeParse({ kind: "text", field: "attr:school", op: "is", values: ["DPS"] }).success).toBe(true);
    expect(audienceFilterSchema.safeParse({ kind: "text", field: "attr:school", op: "is", values: [] }).success).toBe(false);
    expect(audienceFilterSchema.safeParse({ kind: "text", field: "attr:school", op: "is_empty", values: [] }).success).toBe(true);
    expect(audienceFilterSchema.safeParse({ kind: "text", field: "attr:Bad Key", op: "is", values: ["x"] }).success).toBe(false);
    expect(audienceFilterSchema.safeParse({ kind: "tags", op: "any", values: [] }).success).toBe(false);
    expect(audienceFilterSchema.safeParse({ kind: "date", field: "created", op: "within_days" }).success).toBe(false);
    expect(audienceFilterSchema.safeParse({ kind: "date", field: "created", op: "never" }).success).toBe(false);
    expect(audienceFilterSchema.safeParse({ kind: "date", field: "last_seen", op: "never" }).success).toBe(true);
  });

  it("describes filters in plain words", () => {
    expect(describeFilter({ kind: "text", field: "attr:school", op: "is", values: ["DPS", "KV"] })).toBe("School is DPS or KV");
    expect(describeFilter({ kind: "text", field: "attr:parent_name", op: "is_empty", values: [] })).toBe("Parent name is empty");
    expect(describeFilter({ kind: "tags", op: "all", values: ["vip", "class-9"] })).toBe("Tagged vip and class-9");
    expect(describeFilter({ kind: "date", field: "last_seen", op: "within_days", days: 30 })).toBe("Last seen in the last 30 days");
    expect(describeFilter({ kind: "segment", op: "in", segmentId: "s1" }, { s1: "Toppers" })).toBe("In segment Toppers");
    expect(describeAudience([{ kind: "opted_in", value: true }, { kind: "text", field: "attr:class", op: "is", values: ["10"] }])).toBe(
      "Opted in · Class is 10",
    );
  });

  it("requires opt-in unless that filter was removed", () => {
    expect(requiresOptIn([{ kind: "opted_in", value: true }])).toBe(true);
    expect(requiresOptIn([{ kind: "segment", op: "in", segmentId: "s1" }])).toBe(true);
    expect(requiresOptIn([{ kind: "opted_in", value: false }])).toBe(false);
    expect(requiresOptIn([])).toBe(false);
    expect(parseAudience(null)).toBeNull();
    expect(parseAudience({ filters: [{ kind: "opted_in", value: true }] })?.filters).toHaveLength(1);
  });
});

describe("audience SQL", () => {
  it("always excludes contacts without a number, blocked ones and opt-outs", async () => {
    const { text } = await sqlOf([]);
    expect(text).toBe(`c."waId" IS NOT NULL AND NOT c.blocked AND c."optInStatus" <> 'OPTED_OUT'`);
  });

  it("matches custom fields ignoring case, with values as parameters", async () => {
    const { text, values } = await sqlOf([{ kind: "text", field: "attr:school", op: "is", values: [" DPS ", "Kendriya Vidyalaya"] }]);
    expect(text).toContain("lower(btrim(coalesce(c.attributes ->> $1, ''))) = ANY(ARRAY[$2,$3]::text[])");
    expect(values).toEqual(["school", "dps", "kendriya vidyalaya"]);
  });

  it("keeps quotes and SQL in values out of the query", async () => {
    const { text, values } = await sqlOf([{ kind: "text", field: "name", op: "contains", values: ["O'Brien'); DROP TABLE x;--"] }]);
    expect(text).not.toContain("DROP");
    expect(values).toEqual(["o'brien'); drop table x;--"]);
  });

  it("compares phone numbers as digits", async () => {
    const { values } = await sqlOf([{ kind: "text", field: "phone", op: "starts_with", values: ["+91"] }]);
    expect(values).toEqual(["91"]);
  });

  it("handles opt-in, tags and last seen", async () => {
    const { text, values } = await sqlOf([
      { kind: "opted_in", value: false },
      { kind: "tags", op: "none", values: ["Alumni"] },
      { kind: "date", field: "last_seen", op: "not_within_days", days: 7 },
    ]);
    expect(text).toContain(`c."optInStatus" = 'UNKNOWN'`);
    expect(text).toContain("NOT (c.tags && ARRAY[$1]::text[])");
    expect(text).toContain(`NOT EXISTS (SELECT 1 FROM "Conversation" v WHERE v."contactId" = c.id AND v.channel = 'WHATSAPP' AND v."lastInboundAt" >= $2)`);
    expect(values[0]).toBe("alumni");
    expect(values[1]).toEqual(new Date("2026-10-06T00:00:00Z"));
  });

  it("uses saved segments' rules, and refuses deleted ones", async () => {
    const client = {
      segment: { findMany: async () => [{ id: "s1", rules: { tagsAny: ["vip"], countryCodes: ["91"] } }] },
    } as never;
    const { text, values } = await sqlOf([{ kind: "segment", op: "in", segmentId: "s1" }], client);
    expect(text).toContain(`(c."optInStatus" = 'OPTED_IN' AND c.tags && ARRAY[$1]::text[] AND (starts_with(c."waId", $2)))`);
    expect(values).toEqual(["vip", "91"]);
    await expect(sqlOf([{ kind: "segment", op: "in", segmentId: "gone" }])).rejects.toBeInstanceOf(AudienceError);
  });
});

describe("who a broadcast may message", () => {
  const optedIn = { waId: "919800000001", optInStatus: "OPTED_IN" as const };
  const notAsked = { waId: "919800000001", optInStatus: "UNKNOWN" as const };
  const optedOut = { waId: "919800000001", optInStatus: "OPTED_OUT" as const };
  const everyone = { type: "BROADCAST" as const, audience: { filters: [{ kind: "text", field: "attr:class", op: "is", values: ["10"] }] } };

  it("never messages blocked contacts", () => {
    expect(consentProblem({ type: "BROADCAST" }, "UTILITY", { ...optedIn, blocked: true })).toBe("Blocked");
    expect(consentProblem({ type: "API" }, "UTILITY", { ...optedIn, blocked: true })).toBe("Blocked");
  });

  it("needs opt-in unless the audience removed that filter", () => {
    expect(consentProblem({ type: "BROADCAST", audience: { filters: [{ kind: "opted_in", value: true }] } }, "UTILITY", notAsked)).toMatch(/Not opted in/);
    expect(consentProblem(everyone, "UTILITY", notAsked)).toBeNull();
    expect(consentProblem(everyone, "UTILITY", optedOut)).toBe("Opted out");
    expect(consentProblem({ type: "BROADCAST" }, "UTILITY", notAsked)).toMatch(/Not opted in/); // older campaigns
  });
});
