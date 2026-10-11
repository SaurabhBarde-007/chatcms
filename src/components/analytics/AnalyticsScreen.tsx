"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useFetch } from "@/hooks/useFetch";
import { compactNumber, formatMinutes, percent } from "@/lib/format";
import type { AnalyticsDTO } from "@/lib/marketing/analytics";
import { CampaignStatusBadge } from "../campaigns/CampaignStatusBadge";
import { DailyColumns } from "../charts/DailyColumns";
import { Card, ErrorNote, Page, Stat } from "../ui/Page";

const RANGES = [7, 30, 90];
const SOURCE_LABEL: Record<string, string> = {
  csv: "CSV import",
  manual: "Added manually",
  api: "Website / opt-in API",
  keyword: "Keyword",
  whatsapp: "WhatsApp",
  unknown: "Unknown",
};

const noSubscribe = () => () => {};

export function AnalyticsScreen() {
  const [days, setDays] = useState(30);
  const timeZone = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
  const { data, error, loading } = useFetch<AnalyticsDTO>(`/api/analytics?days=${days}&tz=${encodeURIComponent(timeZone)}`);

  return (
    <Page title="Analytics" subtitle={`Engagement over the last ${days} days · ${timeZone}`}>
      {/* Filters: one row, above everything they scope. */}
      <div className="mb-5 flex gap-1.5" role="group" aria-label="Date range">
        {RANGES.map((r) => (
          <button key={r} className={`chip ${days === r ? "chip-active" : ""}`} aria-pressed={days === r} onClick={() => setDays(r)}>
            Last {r} days
          </button>
        ))}
      </div>

      <ErrorNote>{error}</ErrorNote>
      {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {data && (
        // Refetch keeps the frame: the previous numbers stay, dimmed, until the new ones arrive.
        <div className={`space-y-8 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <InboxSection data={data} />
          <CampaignSection data={data} />
          <AudienceSection data={data} />
        </div>
      )}
    </Page>
  );
}

function InboxSection({ data }: { data: AnalyticsDTO }) {
  const t = data.inbox.totals;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Conversations</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Messages received" value={compactNumber(t.received)} />
        <Stat label="Replies sent" value={compactNumber(t.sentByYou)} />
        <Stat label="Active contacts" value={compactNumber(t.activeContacts)} detail="messaged you" />
        <Stat label="New contacts" value={compactNumber(t.newContacts)} />
        <Stat label="Median response time" value={formatMinutes(t.medianResponseMinutes)} detail={t.p90ResponseMinutes !== null ? `90% within ${formatMinutes(t.p90ResponseMinutes)}` : undefined} />
        <Stat label="Replies read" value={t.readRate === null ? "–" : `${Math.round(t.readRate * 100)}%`} detail="of your replies" />
      </div>
      <Card title="Messages per day" className="mt-3">
        <DailyColumns
          label="Messages per day: received from customers and replies you sent"
          data={data.inbox.daily}
          series={[
            { key: "received", label: "Received", color: "var(--viz-series-1)" },
            { key: "sentByYou", label: "Your replies", color: "var(--viz-series-2)" },
          ]}
        />
      </Card>
    </section>
  );
}

function CampaignSection({ data }: { data: AnalyticsDTO }) {
  const t = data.campaigns.totals;
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Campaigns</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Messages sent" value={compactNumber(t.sent)} />
        <Stat label="Delivered" value={percent(t.delivered, t.sent)} detail={`${compactNumber(t.delivered)} people`} />
        <Stat label="Read" value={percent(t.read, t.sent)} detail={`${compactNumber(t.read)} people`} />
        <Stat label="Replied" value={percent(t.replied, t.sent)} detail={`${compactNumber(t.replied)} people`} />
        <Stat label="Button taps" value={compactNumber(t.clicked)} />
        <Stat label="Opted out" value={compactNumber(t.optedOut)} detail="after a campaign" />
      </div>
      <Card title="Campaigns in this period" className="mt-3">
        {data.campaigns.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Campaign</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Sent</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Delivered</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Read</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Replied</th>
                  <th className="py-1.5 text-right font-medium">Opt-outs</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.recent.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">
                      <Link href={`/campaigns/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>{" "}
                      <CampaignStatusBadge status={c.status as never} />
                    </td>
                    <td className="py-1.5 pr-3 text-right">{compactNumber(c.stats.sent)}</td>
                    <td className="py-1.5 pr-3 text-right">{percent(c.stats.delivered, c.stats.sent)}</td>
                    <td className="py-1.5 pr-3 text-right">{percent(c.stats.read, c.stats.sent)}</td>
                    <td className="py-1.5 pr-3 text-right">{percent(c.stats.replied, c.stats.sent)}</td>
                    <td className="py-1.5 text-right">{c.stats.optedOut.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No campaigns in this period.</p>
        )}
      </Card>
    </section>
  );
}

function AudienceSection({ data }: { data: AnalyticsDTO }) {
  const a = data.audience;
  const optIns = a.daily.reduce((s, d) => s + d.optIns, 0);
  const optOuts = a.daily.reduce((s, d) => s + d.optOuts, 0);
  const sourceTotal = a.sources.reduce((s, x) => s + x.count, 0);
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Audience</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Opted in now" value={compactNumber(a.totals.optedIn)} detail={`of ${compactNumber(a.totals.total)} contacts`} />
        <Stat label="Opted out" value={compactNumber(a.totals.optedOut)} />
        <Stat label="Not asked yet" value={compactNumber(a.totals.unknown)} />
        <Stat label="New opt-ins" value={compactNumber(optIns)} detail="this period" />
        <Stat label="Net growth" value={`${optIns - optOuts >= 0 ? "+" : "−"}${compactNumber(Math.abs(optIns - optOuts))}`} detail={`${compactNumber(optOuts)} opt-outs`} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_18rem]">
        <Card title="Opt-ins and opt-outs per day">
          <DailyColumns
            label="Opt-ins per day above the line, opt-outs below"
            data={a.daily}
            series={[
              { key: "optIns", label: "Opt-ins", color: "var(--viz-series-1)" },
              { key: "optOuts", label: "Opt-outs", color: "var(--viz-negative)", direction: "down" },
            ]}
          />
        </Card>
        <Card title="Where opted-in contacts came from">
          {a.sources.length ? (
            <ul className="space-y-2 text-sm">
              {a.sources.map((s) => (
                <li key={s.source}>
                  <div className="flex justify-between gap-2">
                    <span>{SOURCE_LABEL[s.source] ?? s.source}</span>
                    <span className="tabular-nums">
                      {s.count.toLocaleString()} <span className="text-slate-400">{percent(s.count, sourceTotal)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-r bg-[var(--viz-series-1)]" style={{ width: `${(s.count / sourceTotal) * 100}%` }} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Nobody has opted in yet.</p>
          )}
        </Card>
      </div>
    </section>
  );
}
