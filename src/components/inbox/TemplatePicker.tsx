"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { TemplateDTO } from "@/lib/types";

type Props = {
  sending: boolean;
  onSend: (t: { name: string; language: string; params: string[] }) => void;
  onCancel?: () => void;
};

/** Pick an approved WhatsApp template and fill in its {{1}}, {{2}}… placeholders. */
export function TemplatePicker({ sending, onSend, onCancel }: Props) {
  const [templates, setTemplates] = useState<TemplateDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TemplateDTO | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    api
      .get<TemplateDTO[]>("/api/whatsapp/templates")
      .then(setTemplates)
      .catch((err) => setLoadError(err.message));
  }, []);

  function choose(key: string) {
    const t = templates?.find((x) => `${x.name}|${x.language}` === key) ?? null;
    setSelected(t);
    setParams(Array(t?.paramCount ?? 0).fill(""));
  }

  // Show the template text with the placeholders replaced by what you typed.
  const preview = selected?.body.replace(/\{\{(\d+)\}\}/g, (m, n) => params[Number(n) - 1] || m);

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
          {params.map((value, i) => (
            <input
              key={i}
              className="input"
              placeholder={`Value for {{${i + 1}}}`}
              value={value}
              onChange={(e) => setParams(params.map((p, j) => (j === i ? e.target.value : p)))}
            />
          ))}
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
          onClick={() => selected && onSend({ name: selected.name, language: selected.language, params })}
        >
          {sending ? "Sending…" : "Send template"}
        </button>
      </div>
    </div>
  );
}
