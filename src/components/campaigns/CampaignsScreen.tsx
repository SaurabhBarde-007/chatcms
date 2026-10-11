"use client";

import Link from "next/link";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { compactNumber, fullTime, percent, relativeTime } from "@/lib/format";
import type { CampaignDTO } from "@/lib/marketing/campaigns";
import { ErrorNote, Page } from "../ui/Page";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

export function CampaignsScreen() {
  const [live, setLive] = useState(false);
  // Refresh every 5 s while anything is scheduled or sending, so progress moves on its own.
  const first = useFetch<CampaignDTO[]>("/api/campaigns", live ? 5000 : undefined);
  const data = first.data;
  const anyLive = !!data?.some((c) => c.status === "SENDING" || c.status === "SCHEDULED");
  if (anyLive !== live) setLive(anyLive);

  return (
    <Page
      title="Campaigns"
      subtitle="Broadcast an approved WhatsApp template to opted-in contacts."
      actions={
        <Link href="/campaigns/new" className="btn-primary">
          New campaign
        </Link>
      }
    >
      <ErrorNote>{first.error}</ErrorNote>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Audience</th>
              <th className="px-3 py-2 text-right font-medium">Sent</th>
              <th className="px-3 py-2 text-right font-medium">Delivered</th>
              <th className="px-3 py-2 text-right font-medium">Read</th>
              <th className="px-3 py-2 text-right font-medium">Replied</th>
              <th className="px-3 py-2 text-right font-medium">Failed</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data?.map((c) => {
              const s = c.stats;
              return (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {c.templateName} · {when(c)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <CampaignStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {c.segment?.name ?? "All opted-in"}
                    {c.audienceSize !== null && <div className="text-slate-400">{compactNumber(c.audienceSize)} people</div>}
                  </td>
                  <td className="px-3 py-2 text-right">{compactNumber(s.sent)}</td>
                  <td className="px-3 py-2 text-right">{percent(s.delivered, s.sent)}</td>
                  <td className="px-3 py-2 text-right">{percent(s.read, s.sent)}</td>
                  <td className="px-3 py-2 text-right">{percent(s.replied, s.sent)}</td>
                  <td className="px-3 py-2 text-right">{s.failed ? compactNumber(s.failed) : "–"}</td>
                </tr>
              );
            })}
            {data?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  No campaigns yet. Import or collect opted-in contacts, then create your first campaign.
                </td>
              </tr>
            )}
            {!data && !first.error && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

function when(c: CampaignDTO): string {
  if (c.status === "SCHEDULED" && c.scheduledAt) return `starts ${relativeTime(c.scheduledAt)} (${fullTime(c.scheduledAt)})`;
  if (c.startedAt) return `started ${relativeTime(c.startedAt)}`;
  return `created ${relativeTime(c.createdAt)}`;
}
