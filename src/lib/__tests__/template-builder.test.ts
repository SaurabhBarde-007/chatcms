import { describe, expect, it } from "vitest";
import {
  draftToComponents,
  EMPTY_DRAFT,
  nextPlaceholder,
  type TemplateDraft,
  templateToDraft,
  toTemplateName,
  validateDraft,
} from "../marketing/template-builder";

const promo: TemplateDraft = {
  name: "diwali_sale",
  language: "en",
  category: "MARKETING",
  parameterFormat: "POSITIONAL",
  header: { type: "TEXT", text: "Diwali sale for {{1}}", example: "Asha" },
  body: { text: "Hi {{1}}, enjoy {{2}} off on everything this week.", examples: { "1": "Asha", "2": "20%" } },
  footer: "Reply STOP to unsubscribe",
  buttons: [
    { type: "QUICK_REPLY", text: "Stop promotions" },
    { type: "URL", text: "Shop now", url: "https://shop.example.com/sale/{{1}}", example: "diwali" },
    { type: "PHONE_NUMBER", text: "Call us", phone: "+91 98123 45678" },
    { type: "COPY_CODE", example: "DIWALI20" },
  ],
};

describe("draftToComponents", () => {
  it("builds Meta's create payload with samples for every variable", () => {
    expect(draftToComponents(promo)).toEqual([
      { type: "HEADER", format: "TEXT", text: "Diwali sale for {{1}}", example: { header_text: ["Asha"] } },
      { type: "BODY", text: "Hi {{1}}, enjoy {{2}} off on everything this week.", example: { body_text: [["Asha", "20%"]] } },
      { type: "FOOTER", text: "Reply STOP to unsubscribe" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Stop promotions" },
          { type: "URL", text: "Shop now", url: "https://shop.example.com/sale/{{1}}", example: ["https://shop.example.com/sale/diwali"] },
          { type: "PHONE_NUMBER", text: "Call us", phone_number: "+919812345678" },
          { type: "COPY_CODE", example: "DIWALI20" },
        ],
      },
    ]);
  });

  it("uses named-parameter samples for named templates", () => {
    const named: TemplateDraft = {
      ...EMPTY_DRAFT,
      name: "order_ready",
      parameterFormat: "NAMED",
      header: { type: "IMAGE", handle: "4::abc" },
      body: { text: "Hi {{first_name}}, order {{order_id}} is ready.", examples: { first_name: "Asha", order_id: "A-17" } },
    };
    expect(draftToComponents(named)).toEqual([
      { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::abc"] } },
      {
        type: "BODY",
        text: "Hi {{first_name}}, order {{order_id}} is ready.",
        example: { body_text_named_params: [{ param_name: "first_name", example: "Asha" }, { param_name: "order_id", example: "A-17" }] },
      },
    ]);
  });

  it("omits example blocks when there are no variables, and static URLs need no sample", () => {
    const plain = { ...EMPTY_DRAFT, name: "hello", body: { text: "Hello there!", examples: {} }, buttons: [{ type: "URL" as const, text: "Visit", url: "https://example.com", example: "" }] };
    expect(draftToComponents(plain)).toEqual([
      { type: "BODY", text: "Hello there!" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Visit", url: "https://example.com" }] },
    ]);
  });
});

describe("templateToDraft", () => {
  it("round-trips a template as Meta returns it", () => {
    const raw = { id: "123", name: "diwali_sale", language: "en", category: "MARKETING", status: "APPROVED", components: draftToComponents(promo) };
    // Phone numbers come back without spaces; everything else is identical.
    const normalized = { ...promo, buttons: promo.buttons.map((b) => (b.type === "PHONE_NUMBER" ? { ...b, phone: "+919812345678" } : b)) };
    expect(templateToDraft(raw)).toEqual(normalized);
  });

  it("reads media headers and named samples", () => {
    const draft = templateToDraft({
      name: "x",
      language: "en_US",
      category: "UTILITY",
      parameter_format: "NAMED",
      components: [
        { type: "HEADER", format: "IMAGE", example: { header_handle: ["https://scontent.example/img.jpg"] } },
        { type: "BODY", text: "Hi {{name}}!", example: { body_text_named_params: [{ param_name: "name", example: "Ravi" }] } },
      ],
    });
    expect(draft).toMatchObject({
      category: "UTILITY",
      parameterFormat: "NAMED",
      header: { type: "IMAGE", sampleUrl: "https://scontent.example/img.jpg" },
      body: { examples: { name: "Ravi" } },
    });
  });
});

describe("validateDraft", () => {
  it("accepts a valid template", () => {
    expect(validateDraft(promo, "create")).toEqual([]);
  });

  it("explains every problem Meta would reject", () => {
    const bad: TemplateDraft = {
      ...promo,
      name: "Diwali Sale",
      header: { type: "TEXT", text: "*Big* {{1}} {{2}}", example: "" },
      body: { text: "{{1}} hello {{3}}{{4}}", examples: { "1": "a" } },
      footer: "Footer {{1}}",
      buttons: [
        { type: "QUICK_REPLY", text: "A" },
        { type: "URL", text: "", url: "shop.example.com/{{1}}/x", example: "" },
        { type: "QUICK_REPLY", text: "This label is far too long to fit" },
      ],
    };
    const problems = validateDraft(bad, "create");
    expect(problems).toEqual(
      expect.arrayContaining([
        "Name: lowercase letters, numbers and _ only",
        "Header: only one variable is allowed",
        "Header: formatting characters (* _ ~ `) aren't allowed",
        "Body: number variables in order, {{1}}, {{2}}, … with no gaps",
        "Body: put some text between variables (WhatsApp rejects {{1}}{{2}})",
        "Body: a variable can't be at the very start or end. Add some text around it",
        "Body: add a sample value for {{3}}",
        "Footer: variables aren't allowed",
        "Keep quick-reply buttons together (all before or all after the other buttons)",
        "Button 2: label is required",
        "Button 2: enter a full web address (https://…)",
        "Button 2: only one variable, at the very end of the address",
        "Button 3: label max 25 characters",
      ]),
    );
  });

  it("doesn't check name/language when editing (they can't change)", () => {
    expect(validateDraft({ ...promo, name: "" }, "edit")).toEqual([]);
  });

  it("requires a sample for media headers", () => {
    expect(validateDraft({ ...promo, header: { type: "IMAGE" } }, "create")).toContain("Header: upload a sample image");
  });
});

describe("helpers", () => {
  it("makes valid template names", () => {
    expect(toTemplateName("Diwali Sale 2026!")).toBe("diwali_sale_2026");
  });
  it("picks the next variable", () => {
    expect(nextPlaceholder({ ...promo })).toBe("{{3}}");
    expect(nextPlaceholder({ ...EMPTY_DRAFT })).toBe("{{1}}");
    expect(nextPlaceholder({ ...EMPTY_DRAFT, parameterFormat: "NAMED" }, "First Name")).toBe("{{first_name}}");
  });
});
