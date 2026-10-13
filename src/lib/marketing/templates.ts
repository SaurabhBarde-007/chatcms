// WhatsApp message templates: structure, placeholders, and the per-recipient send payload.
// Pure functions (no DB, no fetch) so they can be shared by the server and the campaign
// editor's live preview, and unit tested.
//
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview

export type ParameterFormat = "POSITIONAL" | "NAMED";
export type HeaderFormat = "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

export type TemplateButton = {
  index: number;
  type: string; // QUICK_REPLY | URL | PHONE_NUMBER | COPY_CODE | …
  text: string;
  url?: string;
  /** Placeholders to fill: in a dynamic URL, or ["coupon_code"] for a copy-code button. */
  params: string[];
};

export type Template = {
  name: string;
  language: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  parameterFormat: ParameterFormat;
  header: { format: HeaderFormat; text?: string; params: string[] } | null;
  body: { text: string; params: string[] };
  footer: string | null;
  buttons: TemplateButton[];
  /** Why campaigns can't send this template yet, or null if they can. */
  unsupported: string | null;
};

/** A template as returned by GET /{waba-id}/message_templates. */
export type RawTemplate = {
  name: string;
  language: string;
  status?: string;
  category?: string;
  parameter_format?: string;
  components?: RawComponent[];
};

type RawComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string }[];
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const MEDIA_HEADERS = new Set(["IMAGE", "VIDEO", "DOCUMENT"]);
const SIMPLE_BUTTONS = new Set(["QUICK_REPLY", "PHONE_NUMBER", "VOICE_CALL", "URL", "COPY_CODE", "OTP"]);
/** WhatsApp limit for one-time codes in authentication templates. */
export const MAX_OTP_LENGTH = 15;

/** Placeholder names in the order they first appear: ["1", "2"] or ["first_name", "order_no"]. */
export function placeholders(text: string | undefined | null): string[] {
  if (!text) return [];
  const seen: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

export function parseTemplate(raw: RawTemplate): Template {
  const components = raw.components ?? [];
  const find = (type: string) => components.find((c) => c.type?.toUpperCase() === type);

  const headerRaw = find("HEADER");
  const header = headerRaw
    ? {
        format: (headerRaw.format?.toUpperCase() ?? "TEXT") as HeaderFormat,
        text: headerRaw.text,
        params: placeholders(headerRaw.text),
      }
    : null;

  const bodyText = find("BODY")?.text ?? "";
  const isAuth = raw.category?.toUpperCase() === "AUTHENTICATION";
  const buttons: TemplateButton[] = (find("BUTTONS")?.buttons ?? []).map((b, index) => {
    const raw = b.type?.toUpperCase() ?? "";
    // Authentication templates' code button comes back from WhatsApp as a URL button.
    const type = raw === "OTP" || (isAuth && raw === "URL") ? "OTP" : raw;
    return {
      index,
      type,
      text: b.text ?? "",
      url: b.url,
      // OTP buttons repeat the body's code, so they have no placeholder of their own.
      params: type === "URL" ? placeholders(b.url) : type === "COPY_CODE" ? ["coupon_code"] : [],
    };
  });

  const allParams = [...(header?.params ?? []), ...placeholders(bodyText)];
  const parameterFormat: ParameterFormat =
    raw.parameter_format?.toUpperCase() === "NAMED" || allParams.some((p) => !/^\d+$/.test(p))
      ? "NAMED"
      : "POSITIONAL";

  let unsupported: string | null = null;
  const extra = components.find((c) => !["HEADER", "BODY", "FOOTER", "BUTTONS"].includes(c.type?.toUpperCase()));
  if (extra) unsupported = `${extra.type.toLowerCase().replace(/_/g, " ")} templates aren't supported yet`;
  else if (header?.format === "LOCATION") unsupported = "Location headers aren't supported yet";
  else {
    const odd = buttons.find((b) => !SIMPLE_BUTTONS.has(b.type));
    if (odd) unsupported = `${odd.type.toLowerCase().replace(/_/g, " ")} buttons aren't supported yet`;
  }

  return {
    name: raw.name,
    language: raw.language,
    category: raw.category?.toUpperCase() ?? "",
    parameterFormat,
    header,
    body: { text: bodyText, params: placeholders(bodyText) },
    footer: find("FOOTER")?.text ?? null,
    buttons,
    unsupported,
  };
}

// ---------------------------------------------------------------------------
// Filling placeholders
// ---------------------------------------------------------------------------

/** Where a placeholder's value comes from. */
export type ValueSource =
  | { from: "text"; value: string }
  | { from: "contact"; field: ContactField; fallback: string }
  /** API campaigns: given in each API call's params (e.g. an OTP code or an order number). */
  | { from: "api" };

/** "attr:city" reads a custom field imported from CSV / the opt-in API. */
export type ContactField = "name" | "first_name" | "phone" | "email" | `attr:${string}`;

/**
 * Built-in variables: write {{first_name}}, {{school}}… in a template and they're filled from
 * each contact automatically (campaigns, API campaigns and the inbox). School and class are
 * stored as the contact's "school" / "class" custom fields.
 */
export const BUILTIN_VARIABLES = [
  { name: "first_name", label: "First name", field: "first_name", sample: "Asha", fallback: "there" },
  { name: "phone_number", label: "Phone number", field: "phone", sample: "+919812345678", fallback: "" },
  { name: "school", label: "School", field: "attr:school", sample: "Delhi Public School", fallback: "your school" },
  { name: "class", label: "Class", field: "attr:class", sample: "8", fallback: "your class" },
  { name: "email", label: "Email", field: "email", sample: "asha@example.com", fallback: "" },
] as const satisfies readonly { name: string; label: string; field: ContactField; sample: string; fallback: string }[];

export type BuiltinVariable = (typeof BUILTIN_VARIABLES)[number];

/** Custom-field keys that belong to built-in variables (not listed again as "Custom: …"). */
export const BUILTIN_ATTRIBUTES = ["school", "class"];

// Other placeholder names people commonly use for the same thing.
const BUILTIN_ALIASES: Record<string, BuiltinVariable["name"]> = {
  name: "first_name",
  firstname: "first_name",
  student_name: "first_name",
  customer_name: "first_name",
  phone: "phone_number",
  mobile: "phone_number",
  mobile_number: "phone_number",
  whatsapp_number: "phone_number",
  school_name: "school",
  grade: "class",
  standard: "class",
  email_id: "email",
  email_address: "email",
};

/** The built-in variable a named placeholder stands for, e.g. "school_name" → School. */
export function builtinVariable(placeholder: string): BuiltinVariable | null {
  const name = BUILTIN_ALIASES[placeholder] ?? placeholder;
  return BUILTIN_VARIABLES.find((v) => v.name === name) ?? null;
}

/** "Fill from the contact" for a built-in variable. */
export function builtinSource(v: BuiltinVariable): ValueSource {
  return { from: "contact", field: v.field, fallback: v.fallback };
}

export type TemplateVariables = {
  header: Record<string, ValueSource>;
  /** Public URL of the image / video / document for a media header. */
  headerMediaUrl?: string;
  body: Record<string, ValueSource>;
  /** Keyed by button index. */
  buttons: Record<string, Record<string, ValueSource>>;
};

export type TemplateContact = {
  name: string | null;
  email: string | null;
  waId: string | null;
  attributes: Record<string, unknown>;
};

export const EMPTY_VARIABLES: TemplateVariables = { header: {}, body: {}, buttons: {} };

function contactValue(contact: TemplateContact, field: ContactField): string {
  if (field === "name") return contact.name ?? "";
  if (field === "first_name") return contact.name?.trim().split(/\s+/)[0] ?? "";
  if (field === "phone") return contact.waId ? "+" + contact.waId : "";
  if (field === "email") return contact.email ?? "";
  const value = contact.attributes[field.slice("attr:".length)];
  return value === null || value === undefined ? "" : String(value);
}

/**
 * WhatsApp rejects parameter text containing new lines, tabs or more than 4 spaces in a row,
 * and empty values — so we tidy values up here.
 */
function clean(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/ {5,}/g, "    ").trim();
}

export function resolveValue(source: ValueSource | undefined, contact: TemplateContact): string {
  if (!source) return "";
  if (source.from === "text") return clean(source.value);
  // API values come with each call and are swapped in as text before this.
  if (source.from === "api") return "";
  return clean(contactValue(contact, source.field)) || clean(source.fallback);
}

/** True if some placeholder is filled from each API call's params. */
export function usesApiValues(vars: TemplateVariables): boolean {
  const all = [...Object.values(vars.header), ...Object.values(vars.body), ...Object.values(vars.buttons).flatMap((b) => Object.values(b))];
  return all.some((s) => s.from === "api");
}

/** Human-readable list of what's still missing before this template can be sent. */
export function missingVariables(template: Template, vars: TemplateVariables): string[] {
  const missing: string[] = [];
  const check = (where: string, params: string[], sources: Record<string, ValueSource> | undefined) => {
    for (const p of params) {
      const s = sources?.[p];
      if (s?.from === "api") continue;
      // Every WhatsApp contact has a phone number, so it needs no fallback.
      const ok = s && (s.from === "text" ? clean(s.value) : s.field === "phone" || clean(s.fallback));
      if (!ok) missing.push(`${where} {{${p}}}${s?.from === "contact" ? " needs a fallback" : ""}`);
    }
  };

  if (template.header?.format === "TEXT") check("Header", template.header.params, vars.header);
  if (template.header && MEDIA_HEADERS.has(template.header.format) && !/^https:\/\//.test(vars.headerMediaUrl ?? "")) {
    missing.push(`Header ${template.header.format.toLowerCase()} URL (https://…)`);
  }
  check("Body", template.body.params, vars.body);
  for (const b of template.buttons) check(`Button "${b.text}"`, b.params, vars.buttons[String(b.index)]);
  return missing;
}

type Parameter = { type: "text"; text: string; parameter_name?: string };

function textParams(
  template: Template,
  params: string[],
  sources: Record<string, ValueSource> | undefined,
  contact: TemplateContact,
): Parameter[] {
  const ordered =
    template.parameterFormat === "POSITIONAL" ? [...params].sort((a, b) => Number(a) - Number(b)) : params;
  return ordered.map((p) => {
    const text = resolveValue(sources?.[p], contact);
    if (!text) {
      throw new TemplateValueError(sources?.[p]?.from === "api" ? `No value for {{${p}}}: send it in the API call's params` : `No value for {{${p}}}`);
    }
    return template.parameterFormat === "NAMED" ? { type: "text", parameter_name: p, text } : { type: "text", text };
  });
}

export class TemplateValueError extends Error {}

/** The `template.components` array for one recipient's send request. */
export function buildTemplateComponents(
  template: Template,
  vars: TemplateVariables,
  contact: TemplateContact,
): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];

  if (template.header) {
    if (template.header.format === "TEXT" && template.header.params.length) {
      components.push({ type: "header", parameters: textParams(template, template.header.params, vars.header, contact) });
    } else if (MEDIA_HEADERS.has(template.header.format)) {
      if (!vars.headerMediaUrl) throw new TemplateValueError("No header media URL");
      const kind = template.header.format.toLowerCase();
      components.push({ type: "header", parameters: [{ type: kind, [kind]: { link: vars.headerMediaUrl } }] });
    }
  }

  if (template.body.params.length) {
    components.push({ type: "body", parameters: textParams(template, template.body.params, vars.body, contact) });
  }

  for (const button of template.buttons) {
    if (button.type === "OTP") {
      // Authentication: the one-time code goes in the body AND the button.
      const code = resolveValue(vars.body["1"], contact);
      if (!code) throw new TemplateValueError("No verification code");
      if (code.length > MAX_OTP_LENGTH) throw new TemplateValueError(`Verification codes can be at most ${MAX_OTP_LENGTH} characters`);
      components.push({ type: "button", sub_type: "url", index: String(button.index), parameters: [{ type: "text", text: code }] });
      continue;
    }
    if (!button.params.length) continue;
    const sources = vars.buttons[String(button.index)];
    if (button.type === "COPY_CODE") {
      const code = resolveValue(sources?.coupon_code, contact);
      if (!code) throw new TemplateValueError(`No coupon code for button "${button.text}"`);
      components.push({
        type: "button",
        sub_type: "copy_code",
        index: String(button.index),
        parameters: [{ type: "coupon_code", coupon_code: code }],
      });
    } else {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(button.index),
        parameters: textParams(template, button.params, sources, contact),
      });
    }
  }

  return components;
}

/** The message as the customer will read it — for previews and the inbox thread. */
export function renderTemplateText(template: Template, vars: TemplateVariables, contact: TemplateContact): string {
  const fill = (text: string, sources: Record<string, ValueSource> | undefined) =>
    text.replace(PLACEHOLDER, (m, p: string) =>
      sources?.[p]?.from === "api" ? `[${p}]` : resolveValue(sources?.[p], contact) || m,
    );

  const parts: string[] = [];
  if (template.header?.format === "TEXT" && template.header.text) parts.push(`*${fill(template.header.text, vars.header)}*`);
  else if (template.header && template.header.format !== "TEXT") parts.push(`[${template.header.format.toLowerCase()}]`);
  parts.push(fill(template.body.text, vars.body));
  if (template.footer) parts.push(template.footer);
  if (template.buttons.length) parts.push(template.buttons.map((b) => `[${b.text}]`).join(" "));
  return parts.join("\n\n");
}
