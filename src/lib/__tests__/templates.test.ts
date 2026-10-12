import { describe, expect, it } from "vitest";
import {
  buildTemplateComponents,
  missingVariables,
  parseTemplate,
  placeholders,
  renderTemplateText,
  TemplateValueError,
  type TemplateVariables,
} from "../marketing/templates";

const asha = { name: "Asha Sharma", email: "asha@example.com", waId: "919812345678", attributes: { city: "Pune" } };
const nameless = { name: null, email: null, waId: "919800000000", attributes: {} };

const positional = parseTemplate({
  name: "diwali_sale",
  language: "en",
  status: "APPROVED",
  category: "MARKETING",
  components: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Hi {{1}}! Flat {{2}} off in {{3}}.\nUse it today." },
    { type: "FOOTER", text: "Reply STOP to opt out" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "URL", text: "Shop now", url: "https://shop.example.com/{{1}}" },
        { type: "QUICK_REPLY", text: "Stop promotions" },
        { type: "COPY_CODE", text: "Copy code" },
      ],
    },
  ],
});

const named = parseTemplate({
  name: "order_ready",
  language: "en_US",
  category: "UTILITY",
  parameter_format: "NAMED",
  components: [
    { type: "HEADER", format: "TEXT", text: "Order {{order_no}}" },
    { type: "BODY", text: "Hi {{first_name}}, order {{order_no}} is ready." },
  ],
});

const vars: TemplateVariables = {
  header: {},
  headerMediaUrl: "https://cdn.example.com/diwali.jpg",
  body: {
    "1": { from: "contact", field: "first_name", fallback: "there" },
    "2": { from: "text", value: "20%" },
    "3": { from: "contact", field: "attr:city", fallback: "your city" },
  },
  buttons: { "0": { "1": { from: "text", value: "diwali?src=wa" } }, "2": { coupon_code: { from: "text", value: "DIWALI20" } } },
};

describe("parseTemplate", () => {
  it("reads header, body, footer, buttons and the parameter format", () => {
    expect(positional).toMatchObject({
      parameterFormat: "POSITIONAL",
      header: { format: "IMAGE", params: [] },
      body: { params: ["1", "2", "3"] },
      footer: "Reply STOP to opt out",
      unsupported: null,
    });
    expect(positional.buttons.map((b) => [b.index, b.type, b.params])).toEqual([
      [0, "URL", ["1"]],
      [1, "QUICK_REPLY", []],
      [2, "COPY_CODE", ["coupon_code"]],
    ]);
    expect(named).toMatchObject({ parameterFormat: "NAMED", header: { params: ["order_no"] }, body: { params: ["first_name", "order_no"] } });
  });

  it("infers named parameters even without parameter_format", () => {
    expect(parseTemplate({ name: "x", language: "en", components: [{ type: "BODY", text: "Hi {{name}}" }] }).parameterFormat).toBe("NAMED");
  });

  it("explains what campaigns can't send", () => {
    expect(parseTemplate({ name: "x", language: "en", components: [{ type: "HEADER", format: "LOCATION" }, { type: "BODY", text: "Hi" }] }).unsupported).toMatch(/Location/);
    expect(parseTemplate({ name: "x", language: "en", components: [{ type: "BODY", text: "Hi" }, { type: "BUTTONS", buttons: [{ type: "FLOW", text: "Open" }] }] }).unsupported).toMatch(/flow buttons/);
    expect(parseTemplate({ name: "x", language: "en", components: [{ type: "BODY", text: "Hi" }, { type: "CAROUSEL" }] }).unsupported).toMatch(/carousel/);
  });

  it("lists placeholders once, in order", () => {
    expect(placeholders("{{2}} {{1}} {{2}} {{ name }}")).toEqual(["2", "1", "name"]);
  });
});

describe("buildTemplateComponents", () => {
  it("builds a positional payload with media header, personalized body, URL and copy-code buttons", () => {
    expect(buildTemplateComponents(positional, vars, asha)).toEqual([
      { type: "header", parameters: [{ type: "image", image: { link: "https://cdn.example.com/diwali.jpg" } }] },
      {
        type: "body",
        parameters: [
          { type: "text", text: "Asha" },
          { type: "text", text: "20%" },
          { type: "text", text: "Pune" },
        ],
      },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "diwali?src=wa" }] },
      { type: "button", sub_type: "copy_code", index: "2", parameters: [{ type: "coupon_code", coupon_code: "DIWALI20" }] },
    ]);
  });

  it("uses fallbacks when a contact field is empty", () => {
    const body = buildTemplateComponents(positional, vars, nameless)[1] as { parameters: { text: string }[] };
    expect(body.parameters.map((p) => p.text)).toEqual(["there", "20%", "your city"]);
  });

  it("sends parameter_name for named templates", () => {
    const v: TemplateVariables = {
      header: { order_no: { from: "contact", field: "attr:order_no", fallback: "#" } },
      body: { first_name: { from: "contact", field: "first_name", fallback: "there" }, order_no: { from: "contact", field: "attr:order_no", fallback: "#" } },
      buttons: {},
    };
    const c = { ...asha, attributes: { order_no: "A-17" } };
    expect(buildTemplateComponents(named, v, c)).toEqual([
      { type: "header", parameters: [{ type: "text", parameter_name: "order_no", text: "A-17" }] },
      {
        type: "body",
        parameters: [
          { type: "text", parameter_name: "first_name", text: "Asha" },
          { type: "text", parameter_name: "order_no", text: "A-17" },
        ],
      },
    ]);
  });

  it("removes line breaks and runs of spaces WhatsApp would reject", () => {
    const v = { ...vars, body: { ...vars.body, "2": { from: "text" as const, value: "20%\n\toff     now" } } };
    const body = buildTemplateComponents(positional, v, asha)[1] as { parameters: { text: string }[] };
    expect(body.parameters[1].text).toBe("20% off    now");
  });

  it("throws when a value is missing", () => {
    expect(() => buildTemplateComponents(positional, { ...vars, body: {} }, asha)).toThrow(TemplateValueError);
  });
});

describe("missingVariables / renderTemplateText", () => {
  it("lists what still needs filling in", () => {
    expect(missingVariables(positional, { header: {}, body: { "1": { from: "contact", field: "name", fallback: "" } }, buttons: {} })).toEqual([
      "Header image URL (https://…)",
      "Body {{1}} needs a fallback",
      "Body {{2}}",
      "Body {{3}}",
      'Button "Shop now" {{1}}',
      'Button "Copy code" {{coupon_code}}',
    ]);
    expect(missingVariables(positional, vars)).toEqual([]);
  });

  it("renders the message as the customer sees it", () => {
    expect(renderTemplateText(positional, vars, asha)).toBe(
      "[image]\n\nHi Asha! Flat 20% off in Pune.\nUse it today.\n\nReply STOP to opt out\n\n[Shop now] [Stop promotions] [Copy code]",
    );
  });
});

describe("authentication templates (sending)", () => {
  const auth = parseTemplate({
    name: "login_code",
    language: "en_US",
    category: "AUTHENTICATION",
    components: [
      { type: "BODY", text: "*{{1}}* is your verification code." },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Copy code", url: "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=otp{{1}}" }] },
    ],
  });
  const code = (value: string): TemplateVariables => ({ header: {}, body: { "1": { from: "text", value } }, buttons: {} });

  it("is supported and needs only the code", () => {
    expect(auth.unsupported).toBeNull();
    expect(auth.buttons[0].type).toBe("OTP");
    expect(missingVariables(auth, code("482913"))).toEqual([]);
  });

  it("sends the code in the body and the button", () => {
    expect(buildTemplateComponents(auth, code("482913"), asha)).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
    ]);
  });

  it("rejects codes longer than 15 characters", () => {
    expect(() => buildTemplateComponents(auth, code("1234567890123456"), asha)).toThrow(/at most 15/);
  });
});
