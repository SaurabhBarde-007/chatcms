"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { builtinVariable, resolveValue, type TemplateContact } from "@/lib/marketing/templates";
import type { TemplateDTO } from "@/lib/types";

type Props = {
  /** Who it's for: built-in variables ({{first_name}}, {{school}}…) start out filled from them. */
  contact: TemplateContact;
  sending: boolean;
  onSend: (t: { name: string; language: string; params: string[]; paramNames?: string[] }) => void;
  onCancel?: () => void;
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Pick an approved WhatsApp template and fill in its {{1}} / {{first_name}} placeholders. */
export function TemplatePicker({ contact, sending, onSend, onCancel }: Props) {
  const [templates, setTemplates] = useState<TemplateDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TemplateDTO | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .get<TemplateDTO[]>("/api/whatsapp/templates")
      .then(setTemplates)
      .catch((err) => setLoadError(err.message));
  }, []);

  function choose(key: string) {
    const t = templates?.find((x) => `${x.name}|${x.language}` === key) ?? null;
    setSelected(t);
    const builtin = (p: string) => (t?.named ? builtinVariable(p) : null);
    setValues(
      Object.fromEntries(
        (t?.params ?? []).map((p) => {
          const v = builtin(p);
          return [p, v ? resolveValue({ from: "contact", field: v.field, fallback: "" }, contact) : ""];
        }),
      ),
    );
  }

  // Show the template text with the placeholders replaced by what you typed.
  const preview = selected?.body.replace(PLACEHOLDER, (m, p: string) => values[p]?.trim() || m);
  const params = selected?.params.map((p) => values[p] ?? "") ?? [];

  return (
    <div className="space-y-2">
      {loadError && <p className="text-xs text-red-600">Templates unavailable: {loadError}</p>}

      <select
        className="input"
        value={selected ? `${selected.name}|${selected.language}` : ""}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="">{templates ? "Choose a template…" : "Loading templates…"}</option>
        {templates?.map((t) => (
          <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
            {t.name} ({t.language})
          </option>
        ))}
      </select>

      {selected && (
        <>
          {selected.params.map((p) => {
            const v = selected.named ? builtinVariable(p) : null;
            return (
              <label key={p} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-xs text-slate-500" title={`{{${p}}}`}>
                  {`{{${p}}}`}
                  {v && <span className="block text-[10px] text-teal-700">{v.label}</span>}
                </span>
                <input
                  className="input"
                  placeholder={v ? `${v.label} (not on file)` : `Value for {{${p}}}`}
                  value={values[p] ?? ""}
                  onChange={(e) => setValues({ ...values, [p]: e.target.value })}
                />
              </label>
            );
          })}
          <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-600">{preview}</p>
        </>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn-primary"
          disabled={!selected || sending || params.some((p) => !p.trim())}
          onClick={() =>
            selected &&
            onSend({ name: selected.name, language: selected.language, params, ...(selected.named && { paramNames: selected.params }) })
          }
        >
          {sending ? "Sending…" : "Send template"}
        </button>
      </div>
    </div>
  );
}
