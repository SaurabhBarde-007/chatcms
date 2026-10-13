"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCheck,
  Download,
  Hand,
  RefreshCw,
  Reply,
  Send,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber, formatCurrency, fullTime, percent, relativeTime } from "@/lib/format";
import type { ApiTrigger } from "@/lib/marketing/api-trigger";
import type { CampaignDetailDTO, RecipientDTO, Stage } from "@/lib/marketing/campaigns";
import { DailyColumns } from "../charts/DailyColumns";
import { ErrorNote } from "../ui/Page";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

type Recipients = { recipients: RecipientDTO[]; nextCursor: string | null };
type Daily = { day: string; sent: number; read: number; replied: number }[];
const noSubscribe = () => () => {};

export function CampaignDetail({ id }: { id: string }) {
  const [live, setLive] = useState(true);
  const detail = useFetch<CampaignDetailDTO>(`/api/campaigns/${id}`, live ? 5000 : undefined);
  const c = detail.data;
  const isLive = !c || ["SCHEDULED", "SENDING", "LIVE"].includes(c.status);
  if (isLive !== live) setLive(isLive);
  const [stage, setStage] = useState<Stage | "overview">("overview");
  const [error, setError] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      detail.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!c) {
    return (
      <Shell title="Campaign">
        <div className="p-6">
          <ErrorNote>{detail.error}</ErrorNote>
          {!detail.error && <p className="text-sm text-slate-400">Loading…</p>}
        </div>
      </Shell>
    );
  }

  const s = c.stats;
  const base = Math.max(s.total, 1);
  const stages: { key: Stage | "overview"; label: string; value: number; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", value: s.total, icon: <BarChart3 size={15} /> },
    { key: "sent", label: "Sent", value: s.sent, icon: <Check size={15} /> },
    { key: "delivered", label: "Delivered", value: s.delivered, icon: <CheckCheck size={15} /> },
    { key: "read", label: "Read", value: s.read, icon: <CheckCheck size={15} className="text-sky-500" /> },
    { key: "replied", label: "Replied", value: s.replied, icon: <Reply size={15} /> },
    { key: "clicked", label: "Button taps", value: s.clicked, icon: <Hand size={15} /> },
    { key: "failed", label: "Failed", value: s.failed + s.skipped, icon: <AlertTriangle size={15} className="text-red-500" /> },
  ];

  const actions = (
    <>
      {c.type === "BROADCAST" && (c.status === "SCHEDULED" || c.status === "SENDING") && (
        <button className="btn" onClick={() => confirm("Cancel this campaign? Messages already sent stay sent.") && act(() => api.post(`/api/campaigns/${id}/cancel`))}>
          Cancel campaign
        </button>
      )}
      {c.type === "API" && (
        <button className={c.status === "LIVE" ? "btn" : "btn-primary"} onClick={() => act(() => api.post(`/api/campaigns/${id}/live`, { live: c.status !== "LIVE" }))}>
          {c.status === "LIVE" ? "Pause" : "Go live"}
        </button>
      )}
      <button className="btn-primary" onClick={detail.reload}>
        <RefreshCw size={15} className={detail.loading ? "animate-spin" : ""} /> Refresh
      </button>
    </>
  );

  return (
    <Shell title={c.name} status={<CampaignStatusBadge status={c.status} />} actions={actions}>
      <div className="flex overflow-x-auto border-b border-slate-200 bg-white px-2" role="tablist">
        {stages.map((st) => (
          <button
            key={st.key}
            role="tab"
            aria-selected={stage === st.key}
            onClick={() => setStage(st.key)}
            className={`-mb-px min-w-28 shrink-0 border-b-2 px-4 py-2.5 text-left ${stage === st.key ? "border-[#0f3d3e] bg-slate-50" : "border-transparent hover:bg-slate-50"}`}
          >
            <span className="block text-sm tabular-nums">
              <b className="font-semibold">{st.key === "overview" ? "100%" : percent(st.value, base)}</b>{" "}
              <span className="text-slate-500">({compactNumber(st.value)})</span>
            </span>
            <span className={`flex items-center gap-1 text-sm ${stage === st.key ? "text-[#0f3d3e]" : "text-slate-600"}`}>
              {st.icon} {st.label}
            </span>
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <ErrorNote>{error}</ErrorNote>
        {c.lastError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <b>{c.status === "FAILED" ? "Stopped:" : "Last error:"}</b> {c.lastError}
          </div>
        )}
        {c.status === "SCHEDULED" && c.scheduledAt && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Starts {relativeTime(c.scheduledAt)} ({fullTime(c.scheduledAt)}), on the next scheduler run after that time.
          </div>
        )}
        {c.status === "SENDING" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Sending… {compactNumber(s.total - s.pending)} of {compactNumber(s.total)} processed
            <div className="mt-1.5 h-1.5 rounded-full bg-amber-100">
              <div className="h-1.5 rounded-full bg-amber-500 transition-all" style={{ width: `${((s.total - s.pending) / base) * 100}%` }} />
            </div>
          </div>
        )}

        {stage === "overview" ? <Overview c={c} onSaved={detail.reload} /> : <StageRecipients campaignId={c.id} stage={stage} refreshKey={s.total - s.pending + s.delivered + s.read + s.replied} />}
      </div>
    </Shell>
  );
}

function Shell({ title, status, actions, children }: { title: string; status?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/campaigns" className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Back to campaigns">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="min-w-0 truncate text-lg font-medium">{title}</h1>
        {status}
        <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function duration(c: CampaignDetailDTO): string | null {
  if (c.type === "API") return null;
  if (!c.startedAt) return null;
  const end = c.completedAt ? new Date(c.completedAt) : null;
  const ms = (end?.getTime() ?? Date.parse(c.startedAt)) - Date.parse(c.startedAt);
  const mins = Math.max(1, Math.round(ms / 60_000));
  const text = mins < 60 ? `${mins} minute${mins > 1 ? "s" : ""}` : `${(mins / 60).toFixed(1)} hours`;
  return end ? `Completed in ${text}` : "Still sending";
}

function Overview({ c, onSaved }: { c: CampaignDetailDTO; onSaved: () => void }) {
  const s = c.stats;
  const timeZone = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const daily = useFetch<Daily>(`/api/campaigns/${c.id}/daily?tz=${encodeURIComponent(timeZone)}&v=${s.sent}`);
  // Each day's column = messages sent that day, split into those that got a reply and those that didn't
  // (replies are part of the sent messages, so they're stacked as a share, not added on top).
  const days = fillDays(daily.data ?? []).map((d) => ({ ...d, noReply: d.sent - d.replied }));

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <Info label="Campaign Type" value={c.type} />
        <Info label="Template Name" value={`${c.templateName} (${c.templateLanguage})`} sub={c.templateCategory?.toLowerCase()} />
        <Info label="Created At" value={new Date(c.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} />
        {c.type === "BROADCAST" && c.completedAt && <Info label="Completed At" value={new Date(c.completedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} />}
        {duration(c) && <Info label="Campaign Duration" value={duration(c)!} />}
        <Info label="Audience" value={c.audienceSummary} />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Card label="Status" value={c.status === "COMPLETED" ? "SENT" : c.status} />
          <Card label="Audience" value={compactNumber(c.audienceSize ?? s.total)} />
          <Card label="Total Credit Usage" value={formatCurrency(c.estimatedCost, c.currency)} hint="Estimate: delivered messages × your message rate (Settings)." />
          <Card label="Button taps" value={compactNumber(s.clicked)} />
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-4">
          {[
            ["Sent", s.sent],
            ["Delivered", s.delivered],
            ["Read", s.read],
            ["Replied", s.replied],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-sm text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{compactNumber(value as number)}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="mb-2 font-medium">
            Campaign Messages <span className="text-sm font-normal text-slate-500">(per day)</span>
          </h3>
          {days.length ? (
            <DailyColumns
              label="Campaign messages sent per day, split into replied and not replied yet"
              data={days}
              series={[
                { key: "replied", label: "Replied", color: "var(--viz-series-2)" },
                { key: "noReply", label: "No reply yet", color: "var(--viz-series-1)" },
              ]}
            />
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Nothing sent yet.</p>
          )}
        </div>

        {c.type === "API" && <ApiPanel c={c} onSaved={onSaved} />}

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="mb-2 font-medium">Message</h3>
            <div className="rounded-lg bg-[#e5ddd5] p-3">
              <div className="rounded-lg bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">{c.preview}</div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h3 className="mb-2 font-medium">Not delivered: why</h3>
            {c.failureReasons.length ? (
              <ul className="space-y-1.5 text-sm">
                {c.failureReasons.map((f, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      {f.error}
                      {f.code && <span className="ml-1 text-xs text-slate-400">(code {f.code})</span>}
                    </span>
                    <span className="tabular-nums">{f.count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No failures.</p>
            )}
            {c.buttonTaps.length > 0 && (
              <>
                <h3 className="mt-4 mb-1 font-medium">Button taps</h3>
                <ul className="space-y-1 text-sm">
                  {c.buttonTaps.map((b) => (
                    <li key={b.text} className="flex justify-between">
                      <span>{b.text}</span>
                      <span className="tabular-nums">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Days between the first and last send, so quiet days show as zero. */
function fillDays(rows: Daily): Daily {
  if (!rows.length) return [];
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: Daily = [];
  const start = new Date(`${rows[0].day}T00:00:00Z`);
  const end = new Date(`${rows[rows.length - 1].day}T00:00:00Z`);
  for (let d = start; d <= end && out.length < 120; d = new Date(d.getTime() + 86_400_000)) {
    const day = d.toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, sent: 0, read: 0, replied: 0 });
  }
  return out;
}

function Info({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 wrap-break-word">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function Card({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" title={hint}>
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// API campaign: trigger settings + how to call it
// ---------------------------------------------------------------------------

function ApiPanel({ c, onSaved }: { c: CampaignDetailDTO; onSaved: () => void }) {
  const [trigger, setTrigger] = useState<ApiTrigger>(c.trigger!);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "https://your-app.example.com");
  const inc = trigger.incoming;
  const isAuth = c.template.category === "AUTHENTICATION";
  const usesApi = [...Object.entries(c.variables.body), ...Object.entries(c.variables.header)].filter(([, v]) => v.from === "api").map(([k]) => (isAuth ? "code" : k));

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api.request("PATCH", `/api/campaigns/${c.id}/trigger`, trigger);
      setMessage("Saved");
      onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const params = Object.fromEntries((usesApi.length ? usesApi : ["1"]).map((k) => [k, k === "code" ? "482913" : "value"]));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <h3 className="mb-2 flex items-center gap-1.5 font-medium">
          <Reply size={16} /> Auto-reply to incoming messages
        </h3>
        {isAuth ? (
          <p className="text-slate-500">Authentication templates are only sent from the API.</p>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={inc.enabled} onChange={(e) => setTrigger({ incoming: { ...inc, enabled: e.target.checked } })} />
              Send automatically when a customer messages
            </label>
            {inc.enabled && (
              <>
                <select className="input" value={inc.match} onChange={(e) => setTrigger({ incoming: { ...inc, match: e.target.value as typeof inc.match } })}>
                  <option value="ANY">Any message</option>
                  <option value="FIRST_MESSAGE">First message from a new contact</option>
                  <option value="KEYWORDS">Message contains keywords</option>
                </select>
                {inc.match === "KEYWORDS" && (
                  <input
                    className="input"
                    defaultValue={inc.keywords.join(", ")}
                    placeholder="price, fees, demo"
                    onChange={(e) => setTrigger({ incoming: { ...inc, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) } })}
                  />
                )}
                <label className="flex flex-wrap items-center gap-2">
                  Cooldown
                  <input
                    className="input w-20 py-1"
                    inputMode="numeric"
                    value={inc.cooldownHours}
                    onChange={(e) => setTrigger({ incoming: { ...inc, cooldownHours: Math.max(0, Math.min(720, Number(e.target.value) || 0)) } })}
                  />
                  hours per person
                </label>
              </>
            )}
            <button className="btn" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </button>
            {message && <span className="ml-2 text-xs text-slate-600">{message}</span>}
          </div>
        )}
      </div>

      <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <h3 className="mb-2 flex items-center gap-1.5 font-medium">
          <Send size={16} /> Trigger from your systems
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          Call this from your backend (never the browser). Set <code>API_KEY</code> in your environment first. Full details: docs/API.md
        </p>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {`curl -X POST ${origin}/api/v1/campaigns/send \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ campaign: c.name, phone: "+919812345678", name: "Asha", params })}'`}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipients at one stage
// ---------------------------------------------------------------------------

function StageRecipients({ campaignId, stage, refreshKey }: { campaignId: string; stage: Stage; refreshKey: number }) {
  const key = `${stage}|${refreshKey}`;
  const first = useFetch<Recipients>(`/api/campaigns/${campaignId}/recipients?stage=${stage}&v=${refreshKey}`);
  const [extra, setExtra] = useState<{ key: string; rows: RecipientDTO[]; cursor: string | null }>({ key: "", rows: [], cursor: null });
  const rows = [...(first.data?.recipients ?? []), ...(extra.key === key ? extra.rows : [])];
  const cursor = extra.key === key && extra.rows.length ? extra.cursor : (first.data?.nextCursor ?? null);

  async function loadMore() {
    if (!cursor) return;
    const page = await api.get<Recipients>(`/api/campaigns/${campaignId}/recipients?stage=${stage}&cursor=${cursor}`);
    setExtra((e) => ({ key, rows: [...(e.key === key ? e.rows : []), ...page.recipients], cursor: page.nextCursor }));
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="font-medium capitalize">{stage === "clicked" ? "Tapped a button" : stage}</h3>
        <a className="btn-primary" href={`/api/campaigns/${campaignId}/report?stage=${stage}`} download>
          <Download size={15} /> User Report
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Sent</th>
              <th className="px-4 py-2 font-medium">Read</th>
              <th className="px-4 py-2 font-medium">Replied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">
                  {r.name || r.phone}
                  {r.name && <div className="text-xs text-slate-500">{r.phone}</div>}
                  {r.source && <div className="text-[11px] text-slate-400">via {r.source === "incoming" ? "auto-reply" : r.source}</div>}
                </td>
                <td className="px-4 py-2">
                  <span className="text-xs font-medium">{r.status.toLowerCase()}</span>
                  {r.error && <div className="max-w-xs text-xs text-red-700">{r.error}</div>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.sentAt ? fullTime(r.sentAt) : "–"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{r.readAt ? fullTime(r.readAt) : "–"}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {r.repliedAt ? fullTime(r.repliedAt) : "–"}
                  {r.buttonText && <div>tapped &ldquo;{r.buttonText}&rdquo;</div>}
                </td>
              </tr>
            ))}
            {first.data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nobody at this stage yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="border-t border-slate-100 p-3 text-center">
          <button className="btn" onClick={loadMore}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
