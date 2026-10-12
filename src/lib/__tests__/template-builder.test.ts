import { describe, expect, it } from "vitest";
import {
  authMessage,
  draftToComponents,
  draftToCreatePayload,
  EMPTY_DRAFT,
  nextPlaceholder,
  type TemplateDraft,
  templateToDraft,
  toTemplateName,
  validateDraft,
} from "../marketing/template-builder";

const promo: TemplateDraft = {
  ...EMPTY_DRAFT,
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

describe("authentication templates", () => {
  const otp: TemplateDraft = {
    ...EMPTY_DRAFT,
    name: "login_code",
    language: "en_US",
    category: "AUTHENTICATION",
    ttl: { enabled: true, seconds: 300 },
    auth: { ...EMPTY_DRAFT.auth, otpType: "COPY_CODE", securityRecommendation: true, codeExpirationMinutes: 5, buttonText: "Copy code" },
  };

  it("builds the copy-code create payload with TTL", () => {
    expect(draftToCreatePayload(otp)).toEqual({
      name: "login_code",
      language: "en_US",
      category: "AUTHENTICATION",
      message_send_ttl_seconds: 300,
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 5 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
      ],
    });
    expect(validateDraft(otp, "create")).toEqual([]);
  });

  it("builds one-tap with the Android app", () => {
    const oneTap = { ...otp, auth: { ...otp.auth, otpType: "ONE_TAP" as const, codeExpirationMinutes: null, autofillText: "Autofill", packageName: "com.example.app", signatureHash: "K8a/AINcGX7" } };
    expect(draftToComponents(oneTap)).toEqual([
      { type: "BODY", add_security_recommendation: true },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "ONE_TAP", autofill_text: "Autofill", supported_apps: [{ package_name: "com.example.app", signature_hash: "K8a/AINcGX7" }] }] },
    ]);
  });

  it("validates expiry, app details, zero-tap terms and TTL range", () => {
    const bad = { ...otp, ttl: { enabled: true, seconds: 3600 }, auth: { ...otp.auth, otpType: "ZERO_TAP" as const, codeExpirationMinutes: 120, packageName: "app", signatureHash: "short" } };
    expect(validateDraft(bad, "create")).toEqual([
      "Time-to-live for authentication templates: 30 sec to 15 min",
      "Code expiry: 1 to 90 minutes",
      "Android package name looks wrong (e.g. com.example.app)",
      "App signature hash: the 11-character hash of your Android app",
      "Zero-tap: accept WhatsApp's zero-tap terms",
    ]);
  });

  it("reads an authentication template as WhatsApp returns it", () => {
    const draft = templateToDraft({
      name: "login_code",
      language: "en_US",
      category: "AUTHENTICATION",
      message_send_ttl_seconds: 300,
      components: [
        { type: "BODY", text: "*{{1}}* is your verification code. For your security, do not share this code." },
        { type: "FOOTER", text: "This code expires in 5 minutes." },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Copy code", url: "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code_expiration_minutes=5&code=otp{{1}}" }] },
      ],
    });
    expect(draft).toMatchObject({ category: "AUTHENTICATION", ttl: { enabled: true, seconds: 300 }, auth: { otpType: "COPY_CODE", securityRecommendation: true, codeExpirationMinutes: 5, buttonText: "Copy code" } });
  });

  it("previews the text WhatsApp writes", () => {
    expect(authMessage(otp.auth, "482913")).toEqual({
      body: "*482913* is your verification code. For your security, do not share this code.",
      footer: "This code expires in 5 minutes.",
      button: "Copy code",
    });
  });

  it("checks TTL ranges per category", () => {
    expect(validateDraft({ ...promo, ttl: { enabled: true, seconds: 3600 } }, "create")).toContain("Time-to-live for marketing templates: 12 hours to 30 days");
    expect(validateDraft({ ...promo, ttl: { enabled: true, seconds: 86_400 } }, "create")).toEqual([]);
  });
});

describe("starter templates", () => {
  it("are all valid except for media samples you add yourself", async () => {
    const { TEMPLATE_STARTERS } = await import("../marketing/template-starters");
    for (const s of TEMPLATE_STARTERS) {
      const problems = validateDraft(s.draft, "create").filter((p) => !p.startsWith("Header: upload a sample"));
      expect(problems, s.key).toEqual([]);
    }
  });
});
