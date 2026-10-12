import { describe, expect, it } from "vitest";
import { defaultVariables } from "../../components/campaigns/TemplateSetup";
import { classLabel } from "../format";
import { profileAttributes } from "../marketing/contacts";
import { mapCsvRows } from "../marketing/csv";
import { canUseBuiltins, EMPTY_DRAFT, type TemplateDraft, withBuiltinSamples } from "../marketing/template-builder";
import { buildTemplateComponents, builtinVariable, missingVariables, parseTemplate } from "../marketing/templates";

const student = {
  name: "Asha Sharma",
  email: "asha@example.com",
  waId: "919812345678",
  attributes: { school: "Delhi Public School", class: "8", city: "Pune" },
};

const named = (text: string) =>
  parseTemplate({ name: "t", language: "en", category: "UTILITY", parameter_format: "NAMED", components: [{ type: "BODY", text }] });

describe("builtinVariable", () => {
  it("knows the built-ins and common aliases", () => {
    expect(builtinVariable("first_name")?.field).toBe("first_name");
    expect(builtinVariable("phone_number")?.field).toBe("phone");
    expect(builtinVariable("school")?.field).toBe("attr:school");
    expect(builtinVariable("class")?.field).toBe("attr:class");
    expect(builtinVariable("email")?.field).toBe("email");
    expect(builtinVariable("school_name")?.name).toBe("school");
    expect(builtinVariable("grade")?.name).toBe("class");
    expect(builtinVariable("course_name")).toBeNull();
  });
});

describe("sending with built-in variables", () => {
  it("fills every built-in from the contact", () => {
    const t = named("Hi {{first_name}} ({{phone_number}}, {{email}}), Class {{class}} at {{school}} is ready.");
    const vars = defaultVariables(t, "BROADCAST");
    expect(missingVariables(t, vars)).toEqual(["Body {{email}} needs a fallback"]);

    const [body] = buildTemplateComponents(t, vars, student) as { parameters: { parameter_name: string; text: string }[] }[];
    expect(Object.fromEntries(body.parameters.map((p) => [p.parameter_name, p.text]))).toEqual({
      first_name: "Asha",
      phone_number: "+919812345678",
      email: "asha@example.com",
      class: "8",
      school: "Delhi Public School",
    });
  });

  it("uses the fallback when a student's detail is missing", () => {
    const t = named("Hi {{first_name}}, your results for {{school}} are out.");
    const [body] = buildTemplateComponents(t, defaultVariables(t, "BROADCAST"), { ...student, name: null, attributes: {} }) as {
      parameters: { text: string }[];
    }[];
    expect(body.parameters.map((p) => p.text)).toEqual(["there", "your school"]);
  });

  it("doesn't guess built-ins for other named placeholders or {{1}}-style templates", () => {
    const t = named("Hi {{first_name}}, {{course_name}} starts {{date}}.");
    const vars = defaultVariables(t, "BROADCAST");
    expect(vars.body.course_name).toEqual({ from: "text", value: "" });

    const positional = parseTemplate({ name: "p", language: "en", components: [{ type: "BODY", text: "Hi {{1}}, see {{2}}" }] });
    const pv = defaultVariables(positional, "BROADCAST");
    expect(pv.body["1"]).toMatchObject({ from: "contact", field: "first_name" });
    expect(pv.body["2"]).toEqual({ from: "text", value: "" });
  });
});

describe("template editor", () => {
  const draft = (d: Partial<TemplateDraft>): TemplateDraft => ({ ...EMPTY_DRAFT, ...d });

  it("adds sample values for built-ins, keeping ones you typed", () => {
    const d = withBuiltinSamples(
      draft({
        parameterFormat: "NAMED",
        header: { type: "TEXT", text: "For {{school}}", example: "" },
        body: { text: "Hi {{first_name}}, class {{class}} on {{date}}", examples: { class: "10" } },
      }),
    );
    expect(d.body.examples).toEqual({ first_name: "Asha", class: "10" });
    expect(d.header).toMatchObject({ example: "Delhi Public School" });
  });

  it("leaves {{1}}-style templates alone", () => {
    const d = draft({ body: { text: "Hi {{1}}", examples: {} } });
    expect(withBuiltinSamples(d)).toBe(d);
  });

  it("only offers built-ins when the template can use named variables", () => {
    expect(canUseBuiltins(draft({ body: { text: "Hello", examples: {} } }), "create")).toBe(true);
    expect(canUseBuiltins(draft({ body: { text: "Hi {{1}}", examples: {} } }), "create")).toBe(false);
    expect(canUseBuiltins(draft({ body: { text: "Hello", examples: {} } }), "edit")).toBe(false);
    expect(canUseBuiltins(draft({ parameterFormat: "NAMED", body: { text: "Hi {{x}}", examples: {} } }), "edit")).toBe(true);
  });
});

describe("contact details", () => {
  it("reads school and class from common CSV column names", () => {
    const { rows } = mapCsvRows([
      { phone: "+919812345678", name: "Asha", school_name: "DPS", grade: "8", city: "Pune" },
      { phone: "+919800000001", school: "KV", std: "10" },
    ]);
    expect(rows[0].attributes).toEqual({ school: "DPS", class: "8", city: "Pune" });
    expect(rows[1].attributes).toEqual({ school: "KV", class: "10" });
  });

  it("takes top-level school and class in API calls", () => {
    expect(profileAttributes({ school: " DPS ", class: "8", attributes: { city: "Pune" } })).toEqual({ school: "DPS", class: "8", city: "Pune" });
    expect(profileAttributes({})).toBeUndefined();
  });

  it("labels classes for display", () => {
    expect(classLabel("8")).toBe("Class 8");
    expect(classLabel("Class 10-B")).toBe("Class 10-B");
    expect(classLabel("Grade 5")).toBe("Grade 5");
    expect(classLabel("")).toBeNull();
  });
});
