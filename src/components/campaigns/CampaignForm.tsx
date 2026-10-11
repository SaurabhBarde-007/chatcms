"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber } from "@/lib/format";
import type { CampaignDTO } from "@/lib/marketing/campaigns";
import type { SegmentDTO } from "@/lib/marketing/segment-service";
import {
  EMPTY_VARIABLES,
  missingVariables,
  renderTemplateText,
  type Template,
  type TemplateVariables,
  type ValueSource,
} from "@/lib/marketing/templates";
import { Card, ErrorNote, Page } from "../ui/Page";

const SAMPLE = { name: "Asha Sharma", email: "asha@example.com", waId: "919812345678", attributes: {} };

/** Scheduled campaigns start on the next cron run (every 30 min), so we offer :00 / :30 slots. */
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function todayISO(now: number) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Sensible starting values: {{1}} / {{first_name}} / {{name}} → the contact's first name. */
function defaultVariables(t: Template): TemplateVariables {
  const guess = (p: string): ValueSource =>
    p === "1" || /name/.test(p) ? { from: "contact", field: "first_name", fallback: "there" } : { from: "text", value: "" };
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
    if (templates.data.some((t) => `${t.name}|${t.language}` === preset && !t.unsupported)) chooseTemplate(preset);
  }

  const audience = useFetch<{ size: number }>(`/api/campaigns/audience${segmentId ? `?segmentId=${segmentId}` : ""}`);
  const template = templates.data?.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;

  const scheduledAt = timing === "later" ? new Date(`${date}T${slot}:00`) : null;
  const missing = useMemo(() => (template ? missingVariables(template, variables) : []), [template, variables]);
  const problems = [
    !name.trim() && "Give the campaign a name",
    !template && "Pick a template",
    ...missing.map((m) => `Fill in ${m}`),
    scheduledAt && scheduledAt.getTime() < openedAt && "The scheduled time is in the past",
    audience.data?.size === 0 && "Nobody in this audience has opted in yet",
  ].filter(Boolean) as string[];

  function chooseTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.data?.find((x) => `${x.name}|${x.language}` === key);
    setVariables(t ? defaultVariables(t) : EMPTY_VARIABLES);
    setConfirming(false);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const campaign = await api.post<CampaignDTO>("/api/campaigns", {
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

  const size = audience.data?.size;
  const setSource = (group: "header" | "body", p: string, s: ValueSource) =>
    setVariables((v) => ({ ...v, [group]: { ...v[group], [p]: s } }));
  const setButtonSource = (index: number, p: string, s: ValueSource) =>
    setVariables((v) => ({ ...v, buttons: { ...v.buttons, [index]: { ...v.buttons[index], [p]: s } } }));

  return (
    <Page title="New campaign" subtitle={<Link href="/campaigns" className="hover:underline">← Campaigns</Link>}>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card title="1. Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali sale: VIPs" />
          </Card>

          <Card title="2. Message template">
            <ErrorNote>{templates.error && `Couldn't load your templates: ${templates.error}`}</ErrorNote>
            <select className="input" value={templateKey} onChange={(e) => chooseTemplate(e.target.value)}>
              <option value="">{templates.data ? "Choose an approved template…" : "Loading templates…"}</option>
              {templates.data?.map((t) => (
                <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`} disabled={!!t.unsupported}>
                  {t.name} ({t.language}) · {t.category.toLowerCase()}
                  {t.unsupported ? ` — ${t.unsupported}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              Only templates approved in WhatsApp Manager appear here. Marketing messages must use a <b>marketing</b> template.
            </p>
            {template && template.category !== "MARKETING" && (
              <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                This is a {template.category.toLowerCase()} template. Promotional content in non-marketing templates can get
                the template paused or recategorised by WhatsApp.
              </p>
            )}
          </Card>

          <Card title="3. Personalize">
            {!template ? (
              <p className="text-sm text-slate-400">Pick a template to fill in its placeholders.</p>
            ) : !(template.body.params.length > 0 || template.header || template.buttons.some((b) => b.params.length)) ? (
              <p className="text-sm text-slate-500">This template has no placeholders. Everyone gets the same message.</p>
            ) : (
              <div className="space-y-3">
                {template.header && template.header.format !== "TEXT" && (
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Header {template.header.format.toLowerCase()} URL (public https link)</span>
                    <input
                      className="input mt-1"
                      value={variables.headerMediaUrl ?? ""}
                      onChange={(e) => setVariables((v) => ({ ...v, headerMediaUrl: e.target.value || undefined }))}
                      placeholder="https://…"
                    />
                  </label>
                )}
                {template.header?.format === "TEXT" &&
                  template.header.params.map((p) => (
                    <SourceRow key={`h${p}`} label={`Header {{${p}}}`} value={variables.header[p]} fields={fields.data?.fields ?? []} onChange={(s) => setSource("header", p, s)} />
                  ))}
                {template.body.params.map((p) => (
                  <SourceRow key={`b${p}`} label={`{{${p}}}`} value={variables.body[p]} fields={fields.data?.fields ?? []} onChange={(s) => setSource("body", p, s)} />
                ))}
                {template.buttons
                  .filter((b) => b.params.length)
                  .map((b) =>
                    b.params.map((p) => (
                      <SourceRow
                        key={`btn${b.index}${p}`}
                        label={b.type === "COPY_CODE" ? `"${b.text}" code` : `"${b.text}" link {{${p}}}`}
                        hint={b.url}
                        value={variables.buttons[b.index]?.[p]}
                        fields={fields.data?.fields ?? []}
                        onChange={(s) => setButtonSource(b.index, p, s)}
                      />
                    )),
                  )}
              </div>
            )}
          </Card>

          <Card title="4. Audience">
            <select className="input" value={segmentId} onChange={(e) => { setSegmentId(e.target.value); setConfirming(false); }}>
              <option value="">All opted-in contacts</option>
              {segments.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({compactNumber(s.size)})
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-sm">
              {size === undefined ? "Counting…" : <><b>{size.toLocaleString()}</b> opted-in contact{size === 1 ? "" : "s"} right now.</>}{" "}
              <span className="text-xs text-slate-500">Recounted when the campaign starts; anyone who opts out meanwhile is skipped.</span>
            </p>
          </Card>

          <Card title="5. When">
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
                <p className="w-full text-xs text-slate-500">
                  Scheduled campaigns start on the next check after this time. Checks run every 30 minutes, so allow up to about 30–45 minutes.
                </p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <Card title="Preview">
            {template ? (
              <div className="rounded-lg bg-[#e5ddd5] p-3">
                <div className="max-w-full rounded-lg bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">
                  {renderTemplateText(template, variables, SAMPLE)}
                </div>
                <p className="mt-2 text-[11px] text-slate-600">Shown for a sample contact, &ldquo;Asha Sharma&rdquo;. Custom fields show their fallback.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Pick a template to see the message.</p>
            )}
          </Card>

          <Card>
            {problems.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : confirming ? (
              <div className="space-y-2 text-sm">
                <p>
                  {scheduledAt ? "Schedule" : "Send"} <b>{template?.name}</b> to <b>{size?.toLocaleString()}</b> contact{size === 1 ? "" : "s"}
                  {scheduledAt ? ` on ${scheduledAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : " now"}? WhatsApp
                  charges per delivered marketing message.
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
          </Card>
        </div>
      </div>
    </Page>
  );
}

const CONTACT_FIELDS = [
  { value: "contact:first_name", label: "First name" },
  { value: "contact:name", label: "Full name" },
  { value: "contact:phone", label: "Phone" },
  { value: "contact:email", label: "Email" },
];

/** One placeholder: where its value comes from (+ the text or fallback). */
function SourceRow({
  label,
  hint,
  value,
  fields,
  onChange,
}: {
  label: string;
  hint?: string;
  value: ValueSource | undefined;
  fields: string[];
  onChange: (s: ValueSource) => void;
}) {
  const kind = !value || value.from === "text" ? "text" : `contact:${value.field}`;
  const text = value?.from === "text" ? value.value : (value?.fallback ?? "");

  function choose(k: string) {
    if (k === "text") onChange({ from: "text", value: "" });
    else onChange({ from: "contact", field: k.slice("contact:".length) as never, fallback: "" });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_11rem_1fr] sm:items-center">
      <span className="text-sm font-medium" title={hint}>
        {label}
      </span>
      <select className="input" value={kind} onChange={(e) => choose(e.target.value)} aria-label={`${label} value source`}>
        <option value="text">Fixed text</option>
        {CONTACT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
        {fields.map((f) => (
          <option key={f} value={`contact:attr:${f}`}>
            Custom: {f}
          </option>
        ))}
      </select>
      <input
        className="input"
        value={text}
        aria-label={kind === "text" ? `${label} text` : `${label} fallback`}
        placeholder={kind === "text" ? "Text for everyone" : "If empty, use… (e.g. there)"}
        onChange={(e) =>
          onChange(value?.from === "contact" ? { ...value, fallback: e.target.value } : { from: "text", value: e.target.value })
        }
      />
    </div>
  );
}
