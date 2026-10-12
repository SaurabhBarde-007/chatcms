"use client";

import { AlertCircle, CheckCircle2, Clock, Compass, Copy, FileText, Inbox, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import type { TemplateRowDTO } from "@/lib/marketing/template-admin";
import type { DraftRowDTO } from "@/lib/marketing/template-drafts";
import { TEMPLATE_STARTERS } from "@/lib/marketing/template-starters";
import { ErrorNote, Page } from "../ui/Page";
import { REJECTION_REASON, TemplateStatusBadge } from "./TemplateStatusBadge";

type Tab = "explore" | "all" | "draft" | "pending" | "approved" | "action";

const TABS: { key: Tab; label: string; icon: typeof Compass }[] = [
  { key: "explore", label: "Explore", icon: Compass },
  { key: "all", label: "All", icon: Inbox },
  { key: "draft", label: "Draft", icon: FileText },
  { key: "pending", label: "Pending", icon: Clock },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "action", label: "Action Required", icon: AlertCircle },
];

const IN_TAB: Record<Exclude<Tab, "explore" | "draft">, (status: string) => boolean> = {
  all: () => true,
  pending: (s) => s === "PENDING" || s === "IN_APPEAL",
  approved: (s) => s === "APPROVED",
  action: (s) => s === "REJECTED" || s === "PAUSED" || s === "DISABLED",
};

const HEALTH: Record<string, { label: string; className: string }> = {
  GREEN: { label: "High", className: "bg-emerald-100 text-emerald-800" },
  YELLOW: { label: "Medium", className: "bg-amber-100 text-amber-800" },
  RED: { label: "Low", className: "bg-red-100 text-red-700" },
};

function templateType(t: TemplateRowDTO): string {
  if (t.draft.category === "AUTHENTICATION") return "OTP";
  return t.draft.header.type === "NONE" ? "TEXT" : t.draft.header.type;
}

export function TemplatesScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [inReview, setInReview] = useState(false);
  // While something is in review, check every 20 s so approvals show up on their own.
  const templates = useFetch<TemplateRowDTO[]>("/api/templates", inReview ? 20_000 : undefined);
  const drafts = useFetch<DraftRowDTO[]>("/api/templates/drafts");
  const anyInReview = !!templates.data?.some((t) => IN_TAB.pending(t.status));
  if (anyInReview !== inReview) setInReview(anyInReview);

  const [error, setError] = useState<string | null>(null);
  async function remove(t: TemplateRowDTO) {
    const note = t.status === "APPROVED" ? ` WhatsApp won't let you reuse the name "${t.name}" for 30 days.` : "";
    if (!confirm(`Delete "${t.name}" (${t.language}) from your WhatsApp account? This can't be undone.${note}`)) return;
    try {
      await api.request("DELETE", `/api/templates/${t.id}`);
      templates.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }
  async function removeDraft(d: DraftRowDTO) {
    if (!confirm(`Delete the draft "${d.name || "untitled"}"?`)) return;
    await api.request("DELETE", `/api/templates/drafts/${d.id}`);
    drafts.reload();
  }

  const q = search.trim().toLowerCase();
  const matches = (name: string, body: string) => !q || name.includes(q) || body.toLowerCase().includes(q);
  const rows = tab === "explore" || tab === "draft" ? [] : (templates.data ?? []).filter((t) => IN_TAB[tab](t.status) && matches(t.name, t.draft.body.text));
  const draftRows = (drafts.data ?? []).filter((d) => matches(d.name, d.draft.body.text));
  const count = (k: Tab) =>
    k === "explore" ? TEMPLATE_STARTERS.length : k === "draft" ? drafts.data?.length : templates.data?.filter((t) => IN_TAB[k](t.status)).length;

  const submitted = params.get("submitted");
  const updated = params.get("updated");

  return (
    <Page
      title="Template Messages"
      subtitle="Create and manage your WhatsApp templates. They're reviewed by WhatsApp and also appear in WhatsApp Manager."
      actions={
        <Link href="/templates/new" className="btn-primary">
          + New Template Message
        </Link>
      }
    >
      {(submitted || updated) && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <b>{submitted ?? updated}</b> was {submitted ? "submitted" : "updated"} and sent for review. WhatsApp usually decides within minutes, sometimes up to 24 hours. This page refreshes itself.
        </div>
      )}
      <ErrorNote>{error ?? templates.error}</ErrorNote>

      <input className="input mb-3 max-w-sm" type="search" placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="mb-4 flex overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab flex items-center gap-1.5 ${tab === t.key ? "tab-active" : ""}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} aria-hidden />
            {t.label}
            {count(t.key) !== undefined && <span className="text-xs opacity-60">{count(t.key)}</span>}
          </button>
        ))}
      </div>

      {tab === "explore" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_STARTERS.map((s) => (
            <div key={s.key} className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">{s.title}</h3>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{s.draft.category.toLowerCase()}</span>
              </div>
              <p className="mt-1 flex-1 text-xs text-slate-500">{s.description}</p>
              <p className="mt-2 line-clamp-3 rounded bg-slate-50 p-2 text-xs whitespace-pre-wrap text-slate-600">
                {s.draft.category === "AUTHENTICATION" ? "*123456* is your verification code. For your security, do not share this code." : s.draft.body.text}
              </p>
              <Link href={`/templates/new?starter=${s.key}`} className="btn mt-3 self-start">
                Use this template
              </Link>
            </div>
          ))}
        </div>
      )}

      {tab === "draft" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Last edited</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {draftRows.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium">{d.name || <span className="text-slate-400">untitled</span>}</td>
                  <td className="px-4 py-3">{d.category}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(d.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconLink href={`/templates/new?draft=${d.id}`} label="Continue editing" icon={Pencil} />
                      <IconButton onClick={() => removeDraft(d)} label="Delete draft" icon={Trash2} />
                    </div>
                  </td>
                </tr>
              ))}
              {drafts.data && draftRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    No drafts. Use &ldquo;Save as draft&rdquo; in the template form to finish a template later.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab !== "explore" && tab !== "draft" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Created At</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const health = t.quality ? HEALTH[t.quality] : undefined;
                return (
                  <tr key={t.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="max-w-64 px-4 py-3">
                      <Link href={`/templates/${t.id}`} className="block truncate font-medium hover:underline" title={t.name}>
                        {t.name}
                      </Link>
                      <div className="text-xs text-slate-500">{t.language}</div>
                    </td>
                    <td className="px-4 py-3">{t.category}</td>
                    <td className="px-4 py-3">
                      <TemplateStatusBadge status={t.status} />
                      {t.rejectedReason && (
                        <div className="mt-1 max-w-52 text-xs text-red-700">{REJECTION_REASON[t.rejectedReason] ?? t.rejectedReason.toLowerCase().replace(/_/g, " ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{templateType(t)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${health?.className ?? "bg-slate-200 text-slate-600"}`}>{health?.label ?? "Unknown"}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString([], { dateStyle: "medium" }) : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {t.status === "APPROVED" && <IconLink href={`/campaigns/new?template=${encodeURIComponent(`${t.name}|${t.language}`)}`} label="Use in a campaign" icon={Send} />}
                        <IconLink href={`/templates/${t.id}`} label={t.editable ? "Edit" : "View"} icon={Pencil} />
                        <IconLink href={`/templates/new?from=${t.id}`} label="Duplicate" icon={Copy} />
                        <IconButton onClick={() => remove(t)} label="Delete" icon={Trash2} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {templates.data && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    {templates.data.length ? "No templates here." : "No templates yet. Create one, or start from Explore."}
                  </td>
                </tr>
              )}
              {!templates.data && !templates.error && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Loading templates from WhatsApp…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}

function IconLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Copy }) {
  return (
    <Link href={href} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title={label} aria-label={label}>
      <Icon size={17} aria-hidden />
    </Link>
  );
}

function IconButton({ onClick, label, icon: Icon }: { onClick: () => void; label: string; icon: typeof Copy }) {
  return (
    <button onClick={onClick} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700" title={label} aria-label={label}>
      <Icon size={17} aria-hidden />
    </button>
  );
}
