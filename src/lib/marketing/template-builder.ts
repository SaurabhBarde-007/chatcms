import { placeholders } from "./templates";

// Writing your own WhatsApp templates: the editor's draft ⇄ Meta's `components` format,
// plus the checks Meta applies at review (so problems show up before you submit).
// Pure functions — shared by the editor (live validation + preview) and the server.
//
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components

export type DraftCategory = "MARKETING" | "UTILITY";
export type DraftFormat = "POSITIONAL" | "NAMED";
export type MediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export type DraftHeader =
  | { type: "NONE" }
  | { type: "TEXT"; text: string; example: string }
  /** `handle` comes from uploading a sample file to Meta; `sampleUrl` is what Meta shows us for existing templates. */
  | { type: MediaFormat; handle?: string; sampleUrl?: string };

export type DraftButton =
  | { type: "QUICK_REPLY"; text: string }
  /** `url` may end with one variable, e.g. https://shop.example.com/{{1}}; `example` is its sample value. */
  | { type: "URL"; text: string; url: string; example: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string }
  | { type: "COPY_CODE"; example: string };

export type TemplateDraft = {
  name: string;
  language: string;
  category: DraftCategory;
  parameterFormat: DraftFormat;
  header: DraftHeader;
  body: { text: string; examples: Record<string, string> };
  footer: string;
  buttons: DraftButton[];
};

export const LIMITS = {
  name: 512,
  headerText: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  url: 2000,
  phone: 20,
  copyCode: 20,
  buttons: 10,
  quickReplies: 10,
  urlButtons: 2,
  phoneButtons: 1,
  copyCodeButtons: 1,
};

export const EMPTY_DRAFT: TemplateDraft = {
  name: "",
  language: "en",
  category: "MARKETING",
  parameterFormat: "POSITIONAL",
  header: { type: "NONE" },
  body: { text: "", examples: {} },
  footer: "",
  buttons: [],
};

/** Common WhatsApp template languages (any Meta language code also works). */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "bn", label: "Bengali" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "id", label: "Indonesian" },
];

/** "Diwali Sale 2026!" → "diwali_sale_2026" */
export function toTemplateName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, LIMITS.name);
}

/** The placeholder to insert next: {{3}} after {{1}},{{2}}; or a name for named templates. */
export function nextPlaceholder(draft: TemplateDraft, name?: string): string {
  if (draft.parameterFormat === "NAMED") return `{{${toTemplateName(name || "value")}}}`;
  const used = placeholders(draft.body.text).map(Number).filter(Number.isFinite);
  return `{{${used.length ? Math.max(...used) + 1 : 1}}}`;
}

const ALIGNED_PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function checkPlaceholders(where: string, text: string, format: DraftFormat, problems: string[]) {
  const names = placeholders(text);
  if (!names.length) return;
  if (format === "POSITIONAL") {
    if (names.some((n) => !/^\d+$/.test(n))) problems.push(`${where}: use numbered variables like {{1}} (or switch to named variables)`);
    else {
      const sorted = [...names].map(Number).sort((a, b) => a - b);
      if (sorted.some((n, i) => n !== i + 1)) problems.push(`${where}: number variables in order, {{1}}, {{2}}, … with no gaps`);
    }
  } else if (names.some((n) => !/^[a-z][a-z0-9_]*$/.test(n))) {
    problems.push(`${where}: variable names use lowercase letters, numbers and _ only, e.g. {{first_name}}`);
  }
  if (/\}\}\s*\{\{/.test(text)) problems.push(`${where}: put some text between variables (WhatsApp rejects {{1}}{{2}})`);
}

/** Everything that would make Meta reject the template, in plain language. Empty = ready. */
export function validateDraft(draft: TemplateDraft, mode: "create" | "edit"): string[] {
  const p: string[] = [];

  if (mode === "create") {
    if (!draft.name) p.push("Name is required");
    else if (!/^[a-z0-9_]+$/.test(draft.name)) p.push("Name: lowercase letters, numbers and _ only");
    if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(draft.language)) p.push("Language code looks wrong (e.g. en, en_US, hi)");
  }

  const h = draft.header;
  if (h.type === "TEXT") {
    if (!h.text.trim()) p.push("Header text is empty (or choose no header)");
    if (h.text.length > LIMITS.headerText) p.push(`Header: max ${LIMITS.headerText} characters`);
    const vars = placeholders(h.text);
    if (vars.length > 1) p.push("Header: only one variable is allowed");
    checkPlaceholders("Header", h.text, draft.parameterFormat, p);
    if (vars.length === 1 && !h.example.trim()) p.push("Header: add a sample value for the variable");
    if (/[*_~`]/.test(h.text)) p.push("Header: formatting characters (* _ ~ `) aren't allowed");
  } else if (h.type !== "NONE" && !h.handle && !h.sampleUrl) {
    p.push(`Header: upload a sample ${h.type.toLowerCase()}`);
  }

  const body = draft.body.text;
  if (!body.trim()) p.push("Body is required");
  if (body.length > LIMITS.body) p.push(`Body: max ${LIMITS.body} characters`);
  checkPlaceholders("Body", body, draft.parameterFormat, p);
  const trimmed = body.trim();
  if (/^\{\{[^}]+\}\}/.test(trimmed) || /\{\{[^}]+\}\}$/.test(trimmed)) {
    p.push("Body: a variable can't be at the very start or end. Add some text around it");
  }
  for (const v of placeholders(body)) {
    if (!draft.body.examples[v]?.trim()) p.push(`Body: add a sample value for {{${v}}}`);
  }
  if (/\n{3,}/.test(body)) p.push("Body: no more than one empty line in a row");

  if (draft.footer.length > LIMITS.footer) p.push(`Footer: max ${LIMITS.footer} characters`);
  if (placeholders(draft.footer).length) p.push("Footer: variables aren't allowed");

  const b = draft.buttons;
  const count = (t: DraftButton["type"]) => b.filter((x) => x.type === t).length;
  if (b.length > LIMITS.buttons) p.push(`At most ${LIMITS.buttons} buttons`);
  if (count("URL") > LIMITS.urlButtons) p.push(`At most ${LIMITS.urlButtons} website buttons`);
  if (count("PHONE_NUMBER") > LIMITS.phoneButtons) p.push("At most 1 call button");
  if (count("COPY_CODE") > LIMITS.copyCodeButtons) p.push("At most 1 copy-code button");
  // Quick replies must sit together: QR,QR,URL is fine; QR,URL,QR isn't.
  const groups = b.map((x) => (x.type === "QUICK_REPLY" ? "q" : "o")).join("").replace(/(.)\1+/g, "$1");
  if (groups.length > 2) p.push("Keep quick-reply buttons together (all before or all after the other buttons)");

  b.forEach((x, i) => {
    const n = `Button ${i + 1}`;
    if (x.type !== "COPY_CODE") {
      if (!x.text.trim()) p.push(`${n}: label is required`);
      if (x.text.length > LIMITS.buttonText) p.push(`${n}: label max ${LIMITS.buttonText} characters`);
    }
    if (x.type === "URL") {
      if (!/^https?:\/\/[^\s]+$/.test(x.url.replace(/\{\{\s*\w+\s*\}\}/g, "x"))) p.push(`${n}: enter a full web address (https://…)`);
      const vars = placeholders(x.url);
      if (vars.length > 1 || (vars.length === 1 && !/\{\{\s*\w+\s*\}\}$/.test(x.url))) {
        p.push(`${n}: only one variable, at the very end of the address`);
      }
      if (vars.length === 1 && !x.example.trim()) p.push(`${n}: add a sample value for the address variable`);
      if (x.url.length > LIMITS.url) p.push(`${n}: address too long`);
    }
    if (x.type === "PHONE_NUMBER" && !/^\+?\d{6,19}$/.test(x.phone.replace(/[\s-]/g, ""))) {
      p.push(`${n}: enter a phone number with country code`);
    }
    if (x.type === "COPY_CODE" && (!x.example.trim() || x.example.length > LIMITS.copyCode)) {
      p.push(`${n}: sample code is required (max ${LIMITS.copyCode} characters)`);
    }
  });

  return p;
}

// ---------------------------------------------------------------------------
// Draft → Meta components (for create / edit requests)
// ---------------------------------------------------------------------------

export function draftToComponents(draft: TemplateDraft): Record<string, unknown>[] {
  const named = draft.parameterFormat === "NAMED";
  const components: Record<string, unknown>[] = [];
  const h = draft.header;

  if (h.type === "TEXT") {
    const vars = placeholders(h.text);
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: h.text.trim(),
      ...(vars.length && {
        example: named
          ? { header_text_named_params: [{ param_name: vars[0], example: h.example.trim() }] }
          : { header_text: [h.example.trim()] },
      }),
    });
  } else if (h.type !== "NONE") {
    if (!h.handle) throw new Error("Header sample hasn't been uploaded");
    components.push({ type: "HEADER", format: h.type, example: { header_handle: [h.handle] } });
  }

  const vars = placeholders(draft.body.text);
  const ordered = named ? vars : [...vars].sort((a, b) => Number(a) - Number(b));
  components.push({
    type: "BODY",
    text: draft.body.text.trim(),
    ...(vars.length && {
      example: named
        ? { body_text_named_params: ordered.map((v) => ({ param_name: v, example: draft.body.examples[v].trim() })) }
        : { body_text: [ordered.map((v) => draft.body.examples[v].trim())] },
    }),
  });

  if (draft.footer.trim()) components.push({ type: "FOOTER", text: draft.footer.trim() });

  if (draft.buttons.length) {
    components.push({
      type: "BUTTONS",
      buttons: draft.buttons.map((b) => {
        switch (b.type) {
          case "QUICK_REPLY":
            return { type: "QUICK_REPLY", text: b.text.trim() };
          case "PHONE_NUMBER":
            return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.replace(/[^\d+]/g, "") };
          case "COPY_CODE":
            return { type: "COPY_CODE", example: b.example.trim() };
          case "URL": {
            const dynamic = placeholders(b.url).length > 0;
            return {
              type: "URL",
              text: b.text.trim(),
              url: b.url.trim(),
              // Meta wants the full address as it would look with the sample filled in.
              ...(dynamic && { example: [b.url.trim().replace(ALIGNED_PLACEHOLDER, b.example.trim())] }),
            };
          }
        }
      }),
    });
  }

  return components;
}

// ---------------------------------------------------------------------------
// Meta template (as returned by the API, incl. examples) → draft (for editing)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- Graph API JSON is loosely typed */
export function templateToDraft(raw: any): TemplateDraft {
  const components: any[] = raw.components ?? [];
  const find = (type: string) => components.find((c) => String(c.type).toUpperCase() === type);
  const format: DraftFormat =
    String(raw.parameter_format ?? "").toUpperCase() === "NAMED" ||
    [...placeholders(find("HEADER")?.text), ...placeholders(find("BODY")?.text)].some((v) => !/^\d+$/.test(v))
      ? "NAMED"
      : "POSITIONAL";

  const hc = find("HEADER");
  let header: DraftHeader = { type: "NONE" };
  if (hc) {
    const f = String(hc.format ?? "TEXT").toUpperCase();
    if (f === "TEXT") {
      header = {
        type: "TEXT",
        text: hc.text ?? "",
        example: hc.example?.header_text?.[0] ?? hc.example?.header_text_named_params?.[0]?.example ?? "",
      };
    } else if (f === "IMAGE" || f === "VIDEO" || f === "DOCUMENT") {
      header = { type: f, sampleUrl: hc.example?.header_handle?.[0] };
    }
  }

  const bc = find("BODY");
  const bodyText: string = bc?.text ?? "";
  const examples: Record<string, string> = {};
  if (bc?.example?.body_text_named_params) {
    for (const p of bc.example.body_text_named_params) examples[p.param_name] = p.example ?? "";
  } else if (bc?.example?.body_text?.[0]) {
    const ordered = placeholders(bodyText).sort((a, b) => Number(a) - Number(b));
    bc.example.body_text[0].forEach((v: string, i: number) => {
      if (ordered[i]) examples[ordered[i]] = v;
    });
  }

  const buttons: DraftButton[] = (find("BUTTONS")?.buttons ?? []).flatMap((b: any): DraftButton[] => {
    const type = String(b.type).toUpperCase();
    if (type === "QUICK_REPLY") return [{ type, text: b.text ?? "" }];
    if (type === "PHONE_NUMBER") return [{ type, text: b.text ?? "", phone: b.phone_number ?? "" }];
    if (type === "COPY_CODE") return [{ type, example: Array.isArray(b.example) ? (b.example[0] ?? "") : (b.example ?? "") }];
    if (type === "URL") {
      const url: string = b.url ?? "";
      const full: string = b.example?.[0] ?? "";
      const prefix = url.split("{{")[0];
      return [{ type, text: b.text ?? "", url, example: full.startsWith(prefix) ? full.slice(prefix.length) : full }];
    }
    return [];
  });

  return {
    name: raw.name ?? "",
    language: raw.language ?? "en",
    category: String(raw.category).toUpperCase() === "UTILITY" ? "UTILITY" : "MARKETING",
    parameterFormat: format,
    header,
    body: { text: bodyText, examples },
    footer: find("FOOTER")?.text ?? "",
    buttons,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Only these can be edited (Meta rule). Approved ones: once a day, 10 times a month. */
export function isEditableStatus(status: string): boolean {
  return ["APPROVED", "REJECTED", "PAUSED"].includes(status);
}
