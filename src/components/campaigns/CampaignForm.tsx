"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { classLabel } from "@/lib/format";
import { type AudienceFilter, DEFAULT_FILTERS } from "@/lib/marketing/audience";
import type { AudiencePreview } from "@/lib/marketing/audience-query";
import type { CampaignDTO } from "@/lib/marketing/campaigns";
import type { SegmentDTO } from "@/lib/marketing/segment-service";
import { EMPTY_VARIABLES, missingVariables, type Template, type TemplateVariables } from "@/lib/marketing/templates";
import { ErrorNote } from "../ui/Page";
import { AudienceBuilder } from "./AudienceBuilder";
import { defaultVariables, MessagePreview, TemplateSetup } from "./TemplateSetup";

/** Scheduled campaigns start on the next cron run (every 30 min), so we offer :00 / :30 slots. */
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function todayISO(now: number) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** New broadcast: one template to an audience, now or scheduled. */
export function CampaignForm() {
  const router = useRouter();
  const templates = useFetch<Template[]>("/api/campaigns/templates");
  const segments = useFetch<SegmentDTO[]>("/api/segments");
  const contactMeta = useFetch<{ tags: { tag: string; count: number }[]; fields: string[] }>("/api/contacts/tags");

  // Time the form was opened (render must stay pure; the server re-checks the schedule anyway).
  const [openedAt] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [variables, setVariables] = useState<TemplateVariables>(EMPTY_VARIABLES);
  const [filters, setFilters] = useState<AudienceFilter[]>(DEFAULT_FILTERS);
  const [permission, setPermission] = useState(false);
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [date, setDate] = useState(() => todayISO(openedAt));
  const [slot, setSlot] = useState("10:00");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coming from Templates → "Use": start with that template selected.
  const preset = useSearchParams().get("template");
  const [presetDone, setPresetDone] = useState(false);
  if (!presetDone && preset && templates.data) {
    setPresetDone(true);
    const t = templates.data.find((x) => `${x.name}|${x.language}` === preset && !x.unsupported && x.category !== "AUTHENTICATION");
    if (t) {
      setTemplateKey(preset);
      setVariables(defaultVariables(t, "BROADCAST"));
    }
  }

  // Who matches right now (debounced while you edit the filters).
  const filtersKey = JSON.stringify(filters);
  const [audience, setAudience] = useState<{ key: string; data: AudiencePreview | null; error: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const data = await api.post<AudiencePreview>("/api/campaigns/audience", { filters: JSON.parse(filtersKey) });
        if (!cancelled) setAudience({ key: filtersKey, data, error: null });
      } catch (err) {
        if (!cancelled) setAudience({ key: filtersKey, data: null, error: err instanceof Error ? err.message : "Couldn't count the audience" });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filtersKey]);
  const counted = audience?.key === filtersKey ? audience : null;

  const template = templates.data?.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;
  const scheduledAt = timing === "later" ? new Date(`${date}T${slot}:00`) : null;
  const missing = useMemo(() => (template ? missingVariables(template, variables) : []), [template, variables]);
  const size = counted?.data?.size;
  const notOptedIn = counted?.data?.notOptedIn ?? 0;
  const problems = [
    !name.trim() && "Give the campaign a name",
    !template && "Pick a template",
    ...missing.map((m) => `Fill in ${m}`),
    scheduledAt && scheduledAt.getTime() < openedAt && "The scheduled time is in the past",
    counted?.error,
    size === undefined && !counted?.error && "Counting the audience…",
    size === 0 && "No contacts match this audience",
    notOptedIn > 0 && !permission && "Confirm you have permission to message the contacts who haven't opted in",
  ].filter(Boolean) as string[];

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const campaign = await api.post<CampaignDTO>("/api/campaigns", {
        type: "BROADCAST",
        name,
        templateName: template!.name,
        templateLanguage: template!.language,
        variables,
        audience: { filters },
        scheduledAt: scheduledAt?.toISOString() ?? null,
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the campaign");
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <FormShell title="New Broadcast">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-5 md:p-6">
          <Field title="Campaign Name" help="For you only, e.g. “Diwali sale – VIPs”.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali sale – VIPs" />
          </Field>

          <TemplateSetup
            kind="BROADCAST"
            templates={templates.data}
            templatesError={templates.error}
            fields={contactMeta.data?.fields ?? []}
            templateKey={templateKey}
            onTemplate={(key) => {
              setTemplateKey(key);
              setConfirming(false);
            }}
            variables={variables}
            onVariables={setVariables}
          />

          <Field title="Select Audience" help="Contacts matching every filter. Recounted when the campaign starts; anyone who opts out or is blocked meanwhile is skipped.">
            <AudienceBuilder
              filters={filters}
              onChange={(f) => {
                setFilters(f);
                setConfirming(false);
              }}
              tags={contactMeta.data?.tags ?? []}
              fields={contactMeta.data?.fields ?? []}
              segments={segments.data ?? []}
            />
            <p className="mt-2 text-sm" aria-live="polite">
              Number of contacts:{" "}
              {counted?.error ? (
                <span className="text-red-600">{counted.error}</span>
              ) : size === undefined ? (
                <span className="text-slate-400">counting…</span>
              ) : (
                <b>{size.toLocaleString()}</b>
              )}
            </p>
            {notOptedIn > 0 && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  <b>{notOptedIn.toLocaleString()}</b> of them haven&apos;t opted in. WhatsApp requires people&apos;s permission before you message
                  them; messaging people who didn&apos;t agree can lower your quality rating or get your number restricted.
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={permission} onChange={(e) => setPermission(e.target.checked)} />
                  They gave us permission to message them on WhatsApp (for example on an admission or enquiry form).
                </label>
              </div>
            )}
            {counted?.data && counted.data.sample.length > 0 && <AudienceTable preview={counted.data} />}
          </Field>

          <Field title="When" help="Send now, or schedule it.">
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={timing === "now"} onChange={() => setTiming("now")} /> Send now
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={timing === "later"} onChange={() => setTiming("later")} /> Schedule
              </label>
            </div>
            {timing === "later" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="date" className="input w-auto" min={todayISO(openedAt)} value={date} onChange={(e) => setDate(e.target.value)} />
                <select className="input w-auto" value={slot} onChange={(e) => setSlot(e.target.value)}>
                  {SLOTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-500">your local time</span>
                <p className="w-full text-xs text-slate-500">Scheduled campaigns start on the next check after this time. Checks run every 30 minutes.</p>
              </div>
            )}
          </Field>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-medium">Preview</h2>
            <MessagePreview template={template} variables={variables} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {problems.length > 0 ? (
              <ProblemList problems={problems} />
            ) : confirming ? (
              <div className="space-y-2 text-sm">
                <p>
                  {scheduledAt ? "Schedule" : "Send"} <b>{template?.name}</b> to <b>{size?.toLocaleString()}</b> contact{size === 1 ? "" : "s"}
                  {scheduledAt ? ` on ${scheduledAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : " now"}? WhatsApp charges per delivered message.
                </p>
                <div className="flex gap-2">
                  <button className="btn" onClick={() => setConfirming(false)} disabled={saving}>
                    Back
                  </button>
                  <button className="btn-primary flex-1" onClick={submit} disabled={saving}>
                    {saving ? "Creating…" : scheduledAt ? "Confirm schedule" : `Confirm: send to ${size?.toLocaleString()}`}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-primary w-full" onClick={() => setConfirming(true)}>
                {scheduledAt ? "Review & schedule" : "Review & send"}
              </button>
            )}
            <div className="mt-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          </div>
        </aside>
      </div>
    </FormShell>
  );
}

/** The newest few matching contacts, so you can sanity-check the filters. */
function AudienceTable({ preview }: { preview: AudiencePreview }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Mobile number</th>
            <th className="px-3 py-2 font-medium">School</th>
            <th className="px-3 py-2 font-medium">Class</th>
            <th className="px-3 py-2 font-medium">Tags</th>
            <th className="px-3 py-2 font-medium">Opted in</th>
          </tr>
        </thead>
        <tbody>
          {preview.sample.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="px-3 py-1.5">{c.name || <span className="text-slate-400">No name</span>}</td>
              <td className="px-3 py-1.5 tabular-nums">{c.phone}</td>
              <td className="px-3 py-1.5">{c.attributes.school ? String(c.attributes.school) : <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-1.5">{classLabel(c.attributes.class) ?? <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-1.5 text-xs text-slate-600">{c.tags.join(", ")}</td>
              <td className="px-3 py-1.5 text-xs">{c.optInStatus === "OPTED_IN" ? "Yes" : <span className="text-amber-700">No</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.size > preview.sample.length && (
        <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
          Showing the {preview.sample.length} newest of {preview.size.toLocaleString()}.
        </p>
      )}
    </div>
  );
}

export function FormShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/campaigns" className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Back to campaigns">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-medium">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-7xl p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section>
      <span className="field-title">{title}</span>
      {help && <p className="field-help">{help}</p>}
      {children}
    </section>
  );
}

export function ProblemList({ problems }: { problems: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
      {problems.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}
