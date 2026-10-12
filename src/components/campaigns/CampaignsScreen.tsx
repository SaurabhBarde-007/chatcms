"use client";

import { BarChart3, ChevronLeft, ChevronRight, Download, Plus, RefreshCw, Search, Webhook } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { compactNumber } from "@/lib/format";
import type { CampaignDTO } from "@/lib/marketing/campaigns";
import { ErrorNote } from "../ui/Page";
import { AccountBar } from "./AccountBar";
import { CampaignStatusBadge } from "./CampaignStatusBadge";

type Tab = "all" | "broadcast" | "api" | "scheduled";
const TABS: { key: Tab; label: string; match: (c: CampaignDTO) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "broadcast", label: "Broadcast", match: (c) => c.type === "BROADCAST" },
  { key: "api", label: "API", match: (c) => c.type === "API" },
  { key: "scheduled", label: "Scheduled", match: (c) => c.status === "SCHEDULED" },
];
const PAGE_SIZES = [10, 25, 50];

export function CampaignsScreen() {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [live, setLive] = useState(false);
  // Refresh every 5 s while anything is scheduled or sending, so progress moves on its own.
  const campaigns = useFetch<CampaignDTO[]>("/api/campaigns", live ? 5000 : undefined);
  const anyLive = !!campaigns.data?.some((c) => c.status === "SENDING" || c.status === "SCHEDULED");
  if (anyLive !== live) setLive(anyLive);

  const q = search.trim().toLowerCase();
  const filtered = (campaigns.data ?? []).filter((c) => TABS.find((t) => t.key === tab)!.match(c) && (!q || c.name.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
        <h1 className="text-xl font-medium">Campaigns</h1>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <AccountBar />
          <div className="relative">
            <button className="btn-primary" onClick={() => setLaunchOpen((o) => !o)} aria-expanded={launchOpen} aria-haspopup="menu">
              <Plus size={16} /> Launch
            </button>
            {launchOpen && (
              <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" onMouseLeave={() => setLaunchOpen(false)}>
                <Link role="menuitem" href="/campaigns/new" className="block rounded-md px-3 py-2 hover:bg-slate-50">
                  <span className="block text-sm font-medium">Broadcast</span>
                  <span className="block text-xs text-slate-500">Send a template to a segment, now or scheduled</span>
                </Link>
                <Link role="menuitem" href="/campaigns/new-api" className="block rounded-md px-3 py-2 hover:bg-slate-50">
                  <span className="block text-sm font-medium">API Campaign</span>
                  <span className="block text-xs text-slate-500">Auto-reply to incoming messages, or trigger from your systems</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="relative w-full max-w-md">
              <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                className="input bg-slate-100 py-2.5 pl-10"
                type="search"
                placeholder="Search by campaign name"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <button className="ml-auto flex items-center gap-1.5 text-sm text-slate-700 hover:text-slate-900" onClick={campaigns.reload}>
              <RefreshCw size={16} className={campaigns.loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex overflow-x-auto border-b border-slate-200" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`tab min-w-24 ${tab === t.key ? "tab-active" : ""}`}
                  onClick={() => {
                    setTab(t.key);
                    setPage(0);
                  }}
                >
                  {t.label}
                  {campaigns.data && <span className="ml-1 text-xs opacity-60">{campaigns.data.filter(t.match).length}</span>}
                </button>
              ))}
            </div>
            <a href="/api/campaigns/report" className="btn" download>
              <Download size={15} /> Download Report
            </a>
          </div>

          <ErrorNote>{campaigns.error}</ErrorNote>

          <div className="space-y-2">
            <div className="hidden grid-cols-[3rem_minmax(0,2fr)_8rem_12rem_7rem_6rem] items-center rounded-lg bg-white px-4 py-3 text-sm text-[#0f3d3e] md:grid">
              <BarChart3 size={18} className="text-slate-400" aria-hidden />
              <span>Campaign</span>
              <span>Type</span>
              <span>Created At</span>
              <span>Status</span>
              <span className="text-right">Audience</span>
            </div>
            {rows.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-y-1 rounded-lg border border-transparent bg-white px-4 py-4 text-sm hover:border-slate-200 hover:shadow-sm md:grid-cols-[3rem_minmax(0,2fr)_8rem_12rem_7rem_6rem]"
              >
                <BarChart3 size={18} className="text-[#0f3d3e]" aria-label="View analytics" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{c.name}</span>
                  <span className="block truncate text-xs text-slate-500">{c.templateName}</span>
                </span>
                <span className="col-start-2 flex items-center gap-1 text-xs text-slate-600 md:col-start-auto md:text-sm">
                  {c.type === "API" ? <Webhook size={14} aria-hidden /> : null}
                  {c.type}
                </span>
                <span className="col-start-2 text-xs text-slate-600 md:col-start-auto md:text-sm">
                  {new Date(c.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <span className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto">
                  <CampaignStatusBadge status={c.status} />
                </span>
                <span className="col-start-3 text-right tabular-nums md:col-start-auto">{compactNumber(c.audienceSize ?? c.stats.total)}</span>
              </Link>
            ))}
            {campaigns.data && rows.length === 0 && (
              <p className="rounded-lg bg-white px-4 py-10 text-center text-sm text-slate-400">
                {campaigns.data.length ? "No campaigns match." : "No campaigns yet. Use Launch to send your first broadcast or set up an auto-reply."}
              </p>
            )}
            {!campaigns.data && !campaigns.error && <p className="rounded-lg bg-white px-4 py-10 text-center text-sm text-slate-400">Loading…</p>}
          </div>

          {filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-4 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                Rows per page:
                <select className="rounded border border-slate-300 bg-white px-1.5 py-1" value={pageSize} onChange={(e) => (setPageSize(Number(e.target.value)), setPage(0))}>
                  {PAGE_SIZES.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <span className="tabular-nums">
                {current * pageSize + 1}–{Math.min(filtered.length, (current + 1) * pageSize)} of {filtered.length}
              </span>
              <button className="rounded p-1 hover:bg-slate-200 disabled:opacity-30" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
                <ChevronLeft size={18} />
              </button>
              <button className="rounded p-1 hover:bg-slate-200 disabled:opacity-30" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
