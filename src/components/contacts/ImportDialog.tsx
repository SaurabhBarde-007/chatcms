"use client";

import Papa from "papaparse";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { ImportSummary } from "@/lib/marketing/contacts";
import { ErrorNote, Modal } from "../ui/Page";

type Result = ImportSummary & { skippedRows: number };

/** Upload a CSV of contacts (phone, name, email, school, class, tags, opted_in, any custom columns). */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string; rows: number; columns: string[] } | null>(null);
  const [countryCode, setCountryCode] = useState("91");
  const [addTags, setAddTags] = useState("");
  const [allOptedIn, setAllOptedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function pick(f: File | undefined) {
    setError(null);
    setResult(null);
    if (!f) return setFile(null);
    if (f.size > 4_000_000) return setError("File too large (max 4 MB). Split it into smaller files.");
    const text = await f.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", preview: 50_001 });
    setFile({ name: f.name, text, rows: parsed.data.length, columns: parsed.meta.fields ?? [] });
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Result>("/api/contacts/import", {
        csv: file.text,
        defaultCountryCode: countryCode.replace(/\D/g, ""),
        addTags,
        allOptedIn,
      });
      setResult(r);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import contacts" onClose={onClose} wide>
      {result ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium">Import finished</p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Summary label="New contacts" value={result.created} />
            <Summary label="Updated" value={result.updated} />
            <Summary label="Opted in" value={result.optedIn} />
            <Summary label="Opted out" value={result.optedOut} />
            <Summary label="Kept opted out" value={result.keptOptedOut} hint="They had opted out before (e.g. replied STOP)" />
            <Summary label="Rows skipped" value={result.skippedRows} />
          </ul>
          {result.problems.length > 0 && (
            <details className="rounded-md border border-slate-200 p-2">
              <summary className="cursor-pointer text-slate-600">Rows with problems</summary>
              <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-slate-600">
                {result.problems.map((p, i) => (
                  <li key={i}>
                    Line {p.line}: {p.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div>
            <input type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} className="text-sm" />
            <p className="mt-1.5 text-xs text-slate-500">
              Needs a <b>phone</b> column. Recognised columns: name (or first_name + last_name), email, school, class (or grade /
              standard), tags (separated by , or ;), opted_in (yes/no). Any other column becomes a custom field you can use in
              campaign messages.
            </p>
            {file && (
              <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                <b>{file.name}</b>: {file.rows.toLocaleString()} rows · columns: {file.columns.join(", ") || "none found"}
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Country code for numbers without one</span>
              <input className="input mt-1" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="e.g. 91" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Add tags to everyone imported</span>
              <input className="input mt-1" value={addTags} onChange={(e) => setAddTags(e.target.value)} placeholder="e.g. diwali-2026, store" />
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <input type="checkbox" className="mt-0.5" checked={allOptedIn} onChange={(e) => setAllOptedIn(e.target.checked)} />
            <span className="text-xs text-amber-900">
              <b>Everyone in this file agreed to receive WhatsApp marketing messages from us.</b> They&apos;ll be opted in (rows with
              an opted_in column follow that column instead). Messaging people who didn&apos;t agree can get your number blocked by
              WhatsApp. Contacts who previously opted out stay opted out.
            </span>
          </label>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!file || busy} onClick={submit}>
              {busy ? "Importing…" : file ? `Import ${file.rows.toLocaleString()} rows` : "Import"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Summary({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <li className="rounded-md border border-slate-200 px-3 py-2" title={hint}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value.toLocaleString()}</div>
    </li>
  );
}
