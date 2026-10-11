"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber } from "@/lib/format";
import type { SegmentRules } from "@/lib/marketing/segments";
import { ErrorNote, Modal } from "../ui/Page";

type Preview = { size: number; summary: string; sample: { id: string; name: string | null; phone: string | null }[] };
type Activity = "any" | "active" | "inactive";

const list = (text: string) => text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

export function SegmentEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: { id?: string; name: string; description: string; rules: SegmentRules };
  onClose: () => void;
  onSaved: () => void;
}) {
  const r = initial.rules;
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [tagsAny, setTagsAny] = useState(r.tagsAny.join(", "));
  const [tagsAll, setTagsAll] = useState(r.tagsAll.join(", "));
  const [tagsNone, setTagsNone] = useState(r.tagsNone.join(", "));
  const [activity, setActivity] = useState<Activity>(r.activeWithinDays ? "active" : r.inactiveForDays ? "inactive" : "any");
  const [days, setDays] = useState(String(r.activeWithinDays ?? r.inactiveForDays ?? 30));
  const [messaged, setMessaged] = useState(r.hasMessagedUs === undefined ? "" : String(r.hasMessagedUs));
  const [countries, setCountries] = useState(r.countryCodes.join(", "));
  const [optedInDays, setOptedInDays] = useState(r.optedInWithinDays ? String(r.optedInWithinDays) : "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tags = useFetch<{ tags: { tag: string; count: number }[] }>("/api/contacts/tags");

  const n = Math.max(1, Math.min(3650, Number.parseInt(days, 10) || 30));
  const rules: SegmentRules = {
    tagsAny: list(tagsAny),
    tagsAll: list(tagsAll),
    tagsNone: list(tagsNone),
    activeWithinDays: activity === "active" ? n : undefined,
    inactiveForDays: activity === "inactive" ? n : undefined,
    hasMessagedUs: messaged === "" ? undefined : messaged === "true",
    countryCodes: countries.split(",").map((c) => c.replace(/\D/g, "")).filter(Boolean),
    optedInWithinDays: optedInDays ? Math.max(1, Number.parseInt(optedInDays, 10) || 1) : undefined,
  };
  const rulesKey = JSON.stringify(rules);

  // Live audience size while you edit (debounced).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const p = await api.post<Preview>("/api/segments/preview", { rules: JSON.parse(rulesKey) });
        if (!cancelled) setPreview(p);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Preview failed");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rulesKey]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { name, description: description || null, rules };
      if (initial.id) await api.patch(`/api/segments/${initial.id}`, body);
      else await api.post("/api/segments", body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal title={initial.id ? "Edit segment" : "New segment"} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VIPs active this month" autoFocus />
          </Field>
          <Field label="Description (optional)">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <datalist id="known-tags">
          {tags.data?.tags.map((t) => (
            <option key={t.tag} value={t.tag} />
          ))}
        </datalist>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Has any of these tags">
            <input className="input" list="known-tags" value={tagsAny} onChange={(e) => setTagsAny(e.target.value)} placeholder="vip, gold" />
          </Field>
          <Field label="Has all of these tags">
            <input className="input" list="known-tags" value={tagsAll} onChange={(e) => setTagsAll(e.target.value)} />
          </Field>
          <Field label="Has none of these tags">
            <input className="input" list="known-tags" value={tagsNone} onChange={(e) => setTagsNone(e.target.value)} placeholder="churned" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Activity">
            <div className="flex gap-1.5">
              <select className="input" value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
                <option value="any">Any time</option>
                <option value="active">Messaged us in the last…</option>
                <option value="inactive">No message for…</option>
              </select>
              {activity !== "any" && (
                <input className="input w-20" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} aria-label="days" />
              )}
            </div>
            {activity !== "any" && <span className="text-xs text-slate-500">days</span>}
          </Field>
          <Field label="Has messaged us">
            <select className="input" value={messaged} onChange={(e) => setMessaged(e.target.value)}>
              <option value="">Doesn&apos;t matter</option>
              <option value="true">Yes, at least once</option>
              <option value="false">Never (e.g. imported only)</option>
            </select>
          </Field>
          <Field label="Country codes">
            <input className="input" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="91, 971" />
          </Field>
        </div>

        <Field label="Opted in within the last … days (optional)">
          <input className="input w-32" inputMode="numeric" value={optedInDays} onChange={(e) => setOptedInDays(e.target.value)} placeholder="e.g. 7" />
        </Field>

        <div className="rounded-md bg-slate-50 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-600">{preview?.summary ?? "…"}</span>
            <span className="shrink-0 text-sm">
              <b className="text-lg">{preview ? compactNumber(preview.size) : "…"}</b> opted-in contacts match now
            </span>
          </div>
          {preview && preview.sample.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              e.g. {preview.sample.map((c) => c.name || c.phone).join(", ")}
              {preview.size > preview.sample.length ? "…" : ""}
            </p>
          )}
        </div>

        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!name.trim() || saving} onClick={save}>
            {saving ? "Saving…" : "Save segment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
