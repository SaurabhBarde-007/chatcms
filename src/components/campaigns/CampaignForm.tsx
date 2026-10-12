"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber } from "@/lib/format";
import type { CampaignDTO } from "@/lib/marketing/campaigns";
import type { SegmentDTO } from "@/lib/marketing/segment-service";
import { EMPTY_VARIABLES, missingVariables, type Template, type TemplateVariables } from "@/lib/marketing/templates";
import { ErrorNote } from "../ui/Page";
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
  const fields = useFetch<{ fields: string[] }>("/api/contacts/tags");

  // Time the form was opened (render must stay pure; the server re-checks the schedule anyway).
  const [openedAt] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [variables, setVariables] = useState<TemplateVariables>(EMPTY_VARIABLES);
  const [segmentId, setSegmentId] = useState("");
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

  const audience = useFetch<{ size: number }>(`/api/campaigns/audience${segmentId ? `?segmentId=${segmentId}` : ""}`);
  const template = templates.data?.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;
  const scheduledAt = timing === "later" ? new Date(`${date}T${slot}:00`) : null;
  const missing = useMemo(() => (template ? missingVariables(template, variables) : []), [template, variables]);
  const size = audience.data?.size;
  const problems = [
    !name.trim() && "Give the campaign a name",
    !template && "Pick a template",
    ...missing.map((m) => `Fill in ${m}`),
    scheduledAt && scheduledAt.getTime() < openedAt && "The scheduled time is in the past",
    size === 0 && "Nobody in this audience has opted in yet",
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
        segmentId: segmentId || null,
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
            fields={fields.data?.fields ?? []}
            templateKey={templateKey}
            onTemplate={(key) => {
              setTemplateKey(key);
              setConfirming(false);
            }}
            variables={variables}
            onVariables={setVariables}
          />

          <Field title="Audience" help="Recounted when the campaign starts; anyone who opts out meanwhile is skipped.">
            <select
              className="input"
              value={segmentId}
              onChange={(e) => {
                setSegmentId(e.target.value);
                setConfirming(false);
              }}
            >
              <option value="">All opted-in contacts</option>
              {segments.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({compactNumber(s.size)})
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-sm">{size === undefined ? "Counting…" : <><b>{size.toLocaleString()}</b> opted-in contact{size === 1 ? "" : "s"} right now.</>}</p>
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
