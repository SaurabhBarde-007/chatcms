"use client";

import Link from "next/link";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber, fullTime, percent, relativeTime } from "@/lib/format";
import type { CampaignDetailDTO, RecipientDTO } from "@/lib/marketing/campaigns";
import { Funnel } from "../charts/Funnel";
import { Card, ErrorNote, Page, Stat } from "../ui/Page";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

type Recipients = { recipients: RecipientDTO[]; nextCursor: string | null };

const RECIPIENT_FILTERS = [
  { value: "", label: "All" },
  { value: "READ", label: "Read" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "SENT", label: "Sent" },
  { value: "PENDING", label: "Waiting" },
  { value: "FAILED", label: "Failed" },
  { value: "SKIPPED", label: "Skipped" },
];

export function CampaignDetail({ id }: { id: string }) {
  const [live, setLive] = useState(true);
  const detail = useFetch<CampaignDetailDTO>(`/api/campaigns/${id}`, live ? 4000 : undefined);
  const c = detail.data;
  const isLive = !c || c.status === "SCHEDULED" || c.status === "SENDING";
  if (isLive !== live) setLive(isLive);

  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    if (!confirm("Cancel this campaign? Messages already sent stay sent; nobody else will get it.")) return;
    try {
      await api.post(`/api/campaigns/${id}/cancel`);
      detail.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    }
  }

  if (!c) {
    return (
      <Page title="Campaign">
        <ErrorNote>{detail.error}</ErrorNote>
        {!detail.error && <p className="text-sm text-slate-400">Loading…</p>}
      </Page>
    );
  }

  const s = c.stats;
  const progress = s.total ? (s.total - s.pending) / s.total : 0;

  return (
    <Page
      title={
        <span className="flex flex-wrap items-center gap-2">
          {c.name} <CampaignStatusBadge status={c.status} />
        </span>
      }
      subtitle={
        <>
          <Link href="/campaigns" className="hover:underline">
            ← Campaigns
          </Link>{" "}
          · {c.templateName} ({c.templateLanguage}) · {c.segment?.name ?? "All opted-in contacts"}
        </>
      }
      actions={
        (c.status === "SCHEDULED" || c.status === "SENDING") && (
          <button className="btn" onClick={cancel}>
            Cancel campaign
          </button>
        )
      }
    >
      <div className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        {c.status === "FAILED" && c.lastError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <b>Stopped:</b> {c.lastError}
          </div>
        )}
        {c.status === "SCHEDULED" && c.scheduledAt && (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            Starts {relativeTime(c.scheduledAt)} ({fullTime(c.scheduledAt)}), on the next scheduler run after that time.
          </div>
        )}
        {c.status === "SENDING" && (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Sending… {compactNumber(s.total - s.pending)} of {compactNumber(s.total)} processed
            <div className="mt-1.5 h-1.5 rounded-full bg-sky-100">
              <div className="h-1.5 rounded-full bg-sky-600 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Audience" value={compactNumber(c.audienceSize ?? s.total)} />
          <Stat label="Sent" value={compactNumber(s.sent)} />
          <Stat label="Delivered" value={percent(s.delivered, s.sent)} detail={`${compactNumber(s.delivered)} people`} />
          <Stat label="Read" value={percent(s.read, s.sent)} detail={`${compactNumber(s.read)} people`} />
          <Stat label="Replied" value={percent(s.replied, s.sent)} detail={`${compactNumber(s.replied)} people`} />
          <Stat label="Opted out" value={compactNumber(s.optedOut)} detail={s.failed ? `${compactNumber(s.failed)} failed` : undefined} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Card title="Engagement">
            <Funnel
              stages={[
                { label: "Sent", value: s.sent },
                { label: "Delivered", value: s.delivered },
                { label: "Read", value: s.read },
                { label: "Replied", value: s.replied },
                ...(c.template.buttons.some((b) => b.type === "QUICK_REPLY") ? [{ label: "Tapped a button", value: s.clicked }] : []),
              ]}
              caption="Percentages are of messages sent. Replies count within 3 days, or any reply to this message. Read receipts are missing for people who turned them off."
            />
            {c.buttonTaps.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-slate-600">Button taps</h3>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {c.buttonTaps.map((b) => (
                    <li key={b.text} className="flex justify-between gap-2">
                      <span>{b.text}</span>
                      <span className="tabular-nums">{b.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Message">
            <div className="rounded-lg bg-[#e5ddd5] p-3">
              <div className="rounded-lg bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">{c.preview}</div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Shown for a sample contact.</p>
          </Card>
        </div>

        {c.failureReasons.length > 0 && (
          <Card title="Not delivered: why">
            <table className="w-full text-sm">
              <tbody>
                {c.failureReasons.map((f, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 pr-3">
                      {f.error}
                      {f.code && <span className="ml-1 text-xs text-slate-400">(code {f.code})</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{f.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Code 131049 means WhatsApp limited marketing messages to that person to protect engagement. It isn&apos;t an error you can fix.
            </p>
          </Card>
        )}

        <RecipientsTable campaignId={c.id} refreshKey={s.total - s.pending + s.delivered + s.read} />
      </div>
    </Page>
  );
}

function RecipientsTable({ campaignId, refreshKey }: { campaignId: string; refreshKey: number }) {
  const [status, setStatus] = useState("");
  const [extra, setExtra] = useState<{ key: string; rows: RecipientDTO[]; cursor: string | null }>({ key: "", rows: [], cursor: null });
  const key = `${status}|${refreshKey}`;
  const first = useFetch<Recipients>(`/api/campaigns/${campaignId}/recipients?status=${status}&v=${refreshKey}`);

  const rows = [...(first.data?.recipients ?? []), ...(extra.key === key ? extra.rows : [])];
  const cursor = extra.key === key && extra.rows.length ? extra.cursor : (first.data?.nextCursor ?? null);

  async function loadMore() {
    if (!cursor) return;
    const page = await api.get<Recipients>(`/api/campaigns/${campaignId}/recipients?status=${status}&cursor=${cursor}`);
    setExtra((e) => ({ key, rows: [...(e.key === key ? e.rows : []), ...page.recipients], cursor: page.nextCursor }));
  }

  return (
    <Card
      title="Recipients"
      actions={
        <div className="flex flex-wrap gap-1">
          {RECIPIENT_FILTERS.map((f) => (
            <button key={f.label} className={`chip ${status === f.value ? "chip-active" : ""}`} onClick={() => setStatus(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Contact</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium">Sent</th>
              <th className="py-1.5 pr-3 font-medium">Read</th>
              <th className="py-1.5 font-medium">Replied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-3">
                  {r.name || r.phone}
                  {r.name && <div className="text-xs text-slate-500">{r.phone}</div>}
                </td>
                <td className="py-1.5 pr-3">
                  <span className="text-xs font-medium">{r.status.toLowerCase()}</span>
                  {r.error && <div className="max-w-xs text-xs text-red-700">{r.error}</div>}
                </td>
                <td className="py-1.5 pr-3 text-xs text-slate-500">{r.sentAt ? fullTime(r.sentAt) : "–"}</td>
                <td className="py-1.5 pr-3 text-xs text-slate-500">{r.readAt ? fullTime(r.readAt) : "–"}</td>
                <td className="py-1.5 text-xs text-slate-500">
                  {r.repliedAt ? fullTime(r.repliedAt) : "–"}
                  {r.buttonText && <div>tapped &ldquo;{r.buttonText}&rdquo;</div>}
                </td>
              </tr>
            ))}
            {first.data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Nobody here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="mt-3 text-center">
          <button className="btn" onClick={loadMore}>
            Load more
          </button>
        </div>
      )}
    </Card>
  );
}
