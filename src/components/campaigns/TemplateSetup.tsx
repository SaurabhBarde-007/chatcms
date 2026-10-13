"use client";

import type { ReactNode } from "react";
import {
  BUILTIN_ATTRIBUTES,
  BUILTIN_VARIABLES,
  builtinSource,
  builtinVariable,
  EMPTY_VARIABLES,
  renderTemplateText,
  type ContactField,
  type Template,
  type TemplateVariables,
  type ValueSource,
} from "@/lib/marketing/templates";

// Choosing a template and filling its placeholders — shared by the broadcast and API campaign forms.

export const SAMPLE = {
  name: "Asha Sharma",
  email: "asha@example.com",
  waId: "919812345678",
  attributes: { school: "Delhi Public School", class: "8" },
};
export type CampaignKind = "BROADCAST" | "API";

/**
 * Sensible starting values: built-in variables ({{first_name}}, {{school}}…) and {{1}} come from
 * the contact. Other placeholders: fixed text, or (API campaigns without auto-reply) a value from
 * each API call.
 */
export function defaultVariables(t: Template, kind: CampaignKind, autoReply = false): TemplateVariables {
  if (t.category === "AUTHENTICATION") {
    // The one-time code comes with each API call (params.code).
    return { ...EMPTY_VARIABLES, body: { "1": { from: "api" } } };
  }
  const builtin = (p: string) => (p === "1" ? BUILTIN_VARIABLES[0] : t.parameterFormat === "NAMED" ? builtinVariable(p) : null);
  const guess = (p: string): ValueSource => {
    const v = builtin(p);
    if (v) return builtinSource(v);
    return kind === "API" && !autoReply ? { from: "api" } : { from: "text", value: "" };
  };
  const fill = (params: string[]) => Object.fromEntries(params.map((p) => [p, guess(p)]));
  return {
    header: t.header?.format === "TEXT" ? fill(t.header.params) : {},
    headerMediaUrl: undefined,
    body: fill(t.body.params),
    buttons: Object.fromEntries(
      t.buttons.filter((b) => b.params.length).map((b) => [String(b.index), Object.fromEntries(b.params.map((p) => [p, { from: "text" as const, value: "" }]))]),
    ),
  };
}

export function TemplateSetup({
  kind,
  templates,
  templatesError,
  fields,
  templateKey,
  onTemplate,
  variables,
  onVariables,
  autoReply,
}: {
  kind: CampaignKind;
  templates: Template[] | null;
  templatesError: string | null;
  fields: string[];
  templateKey: string;
  onTemplate: (key: string, template: Template | null) => void;
  variables: TemplateVariables;
  onVariables: (v: TemplateVariables) => void;
  /** API campaigns that auto-reply can't use "From each API call". */
  autoReply?: boolean;
}) {
  const template = templates?.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;
  const unusable = (t: Template) =>
    t.unsupported ?? (kind === "BROADCAST" && t.category === "AUTHENTICATION" ? "authentication templates are sent with API campaigns" : null);

  const setSource = (group: "header" | "body", p: string, s: ValueSource) => onVariables({ ...variables, [group]: { ...variables[group], [p]: s } });
  const setButtonSource = (index: number, p: string, s: ValueSource) =>
    onVariables({ ...variables, buttons: { ...variables.buttons, [index]: { ...variables.buttons[index], [p]: s } } });
  const rowProps = { fields, kind, autoReply: Boolean(autoReply) };

  return (
    <div className="space-y-5">
      <div>
        <label className="field-title" htmlFor="template">
          Template
        </label>
        <p className="field-help">Only templates approved by WhatsApp can be sent.</p>
        {templatesError && <p className="mb-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">Couldn&apos;t load your templates: {templatesError}</p>}
        <select
          id="template"
          className="input"
          value={templateKey}
          onChange={(e) => {
            const t = templates?.find((x) => `${x.name}|${x.language}` === e.target.value) ?? null;
            onTemplate(e.target.value, t);
            onVariables(t ? defaultVariables(t, kind, autoReply) : EMPTY_VARIABLES);
          }}
        >
          <option value="">{templates ? "Choose an approved template…" : "Loading templates…"}</option>
          {templates?.map((t) => (
            <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`} disabled={!!unusable(t)}>
              {t.name} ({t.language}) · {t.category.toLowerCase()}
              {unusable(t) ? ` (${unusable(t)})` : ""}
            </option>
          ))}
        </select>
        {template && kind === "BROADCAST" && template.category !== "MARKETING" && (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            This is a {template.category.toLowerCase()} template. Promotional content in non-marketing templates can get the template paused by WhatsApp.
          </p>
        )}
      </div>

      {template && (
        <div>
          <span className="field-title">Personalize</span>
          <p className="field-help">
            Where each placeholder&apos;s value comes from.
            {kind === "API" && !autoReply && " Values can also be overridden in each API call's params."}
          </p>
          {template.category === "AUTHENTICATION" ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              The one-time code is sent with each API call as <code className="rounded bg-white px-1">params.code</code> (max 15 characters).
            </p>
          ) : (
            <div className="space-y-3">
              {template.header && template.header.format !== "TEXT" && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Header {template.header.format.toLowerCase()} URL (public https link)</span>
                  <input
                    className="input mt-1"
                    value={variables.headerMediaUrl ?? ""}
                    onChange={(e) => onVariables({ ...variables, headerMediaUrl: e.target.value || undefined })}
                    placeholder="https://…"
                  />
                </label>
              )}
              {template.header?.format === "TEXT" &&
                template.header.params.map((p) => (
                  <ValueSourceRow key={`h${p}`} label={`Header {{${p}}}`} value={variables.header[p]} onChange={(s) => setSource("header", p, s)} {...rowProps} />
                ))}
              {template.body.params.map((p) => (
                <ValueSourceRow key={`b${p}`} label={`{{${p}}}`} value={variables.body[p]} onChange={(s) => setSource("body", p, s)} {...rowProps} />
              ))}
              {template.buttons
                .filter((b) => b.params.length)
                .map((b) =>
                  b.params.map((p) => (
                    <ValueSourceRow
                      key={`btn${b.index}${p}`}
                      label={b.type === "COPY_CODE" ? `"${b.text}" code` : `"${b.text}" link {{${p}}}`}
                      hint={b.url}
                      value={variables.buttons[b.index]?.[p]}
                      onChange={(s) => setButtonSource(b.index, p, s)}
                      {...rowProps}
                    />
                  )),
                )}
              {template.body.params.length === 0 && !template.header && !template.buttons.some((b) => b.params.length) && (
                <p className="text-sm text-slate-500">This template has no placeholders. Everyone gets the same message.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The built-in variables' fields, plus the full name.
const CONTACT_FIELDS = [
  ...BUILTIN_VARIABLES.map((v) => ({ value: `contact:${v.field}`, label: v.label })),
  { value: "contact:name", label: "Full name" },
];

/** One placeholder: where its value comes from (+ the text or fallback). */
function ValueSourceRow({
  label,
  hint,
  value,
  fields,
  kind,
  autoReply,
  onChange,
}: {
  label: string;
  hint?: string;
  value: ValueSource | undefined;
  fields: string[];
  kind: CampaignKind;
  autoReply: boolean;
  onChange: (s: ValueSource) => void;
}) {
  const source: string =
    !value || value.from === "text" ? "text" : value.from === "api" ? "api" : `contact:${value.field}`;

  function choose(k: string) {
    if (k === "text") onChange({ from: "text", value: "" });
    else if (k === "api") onChange({ from: "api" });
    else {
      const field = k.slice("contact:".length) as ContactField;
      onChange({ from: "contact", field, fallback: BUILTIN_VARIABLES.find((v) => v.field === field)?.fallback ?? "" });
    }
  }

  let detail: ReactNode;
  if (value?.from === "api") {
    detail = <p className="py-2 text-xs text-slate-500">Sent in each API call: params[&quot;{label.replace(/.*\{\{(.+)\}\}.*/, "$1")}&quot;]</p>;
  } else {
    const text = value?.from === "text" ? value.value : value?.from === "contact" ? value.fallback : "";
    detail = (
      <input
        className="input"
        value={text}
        aria-label={source === "text" ? `${label} text` : `${label} fallback`}
        placeholder={source === "text" ? "Text for everyone" : "If empty, use… (e.g. there)"}
        onChange={(e) => onChange(value?.from === "contact" ? { ...value, fallback: e.target.value } : { from: "text", value: e.target.value })}
      />
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_12rem_minmax(0,1fr)] sm:items-start">
      <span className="pt-2 text-sm font-medium" title={hint}>
        {label}
      </span>
      <select className="input" value={source} onChange={(e) => choose(e.target.value)} aria-label={`${label} value source`}>
        <option value="text">Fixed text</option>
        {CONTACT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
        {fields.filter((f) => !BUILTIN_ATTRIBUTES.includes(f)).map((f) => (
          <option key={f} value={`contact:attr:${f}`}>
            Custom: {f}
          </option>
        ))}
        {kind === "API" && (
          <option value="api" disabled={autoReply}>
            From each API call{autoReply ? " (not with auto-reply)" : ""}
          </option>
        )}
      </select>
      <div className="min-w-0">{detail}</div>
    </div>
  );
}

/** How the message will look for a sample contact. */
export function MessagePreview({ template, variables }: { template: Template | null; variables: TemplateVariables }) {
  if (!template) return <p className="text-sm text-slate-400">Pick a template to see the message.</p>;
  return (
    <div className="rounded-lg bg-[#e5ddd5] p-3">
      <div className="rounded-lg bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">{renderTemplateText(template, variables, SAMPLE)}</div>
      <p className="mt-2 text-[11px] text-slate-600">Shown for a sample contact, &ldquo;Asha Sharma&rdquo;.</p>
    </div>
  );
}
