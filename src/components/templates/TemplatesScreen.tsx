"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import type { TemplateRowDTO } from "@/lib/marketing/template-admin";
import { ErrorNote, Page } from "../ui/Page";
import { REJECTION_REASON, TemplateStatusBadge } from "./TemplateStatusBadge";

const FILTERS: { label: string; match: (s: string) => boolean }[] = [
  { label: "All", match: () => true },
  { label: "Approved", match: (s) => s === "APPROVED" },
  { label: "In review", match: (s) => s === "PENDING" || s === "IN_APPEAL" },
  { label: "Rejected", match: (s) => s === "REJECTED" },
  { label: "Paused / disabled", match: (s) => s === "PAUSED" || s === "DISABLED" },
];

const QUALITY: Record<string, string> = { GREEN: "High", YELLOW: "Medium", RED: "Low" };

export function TemplatesScreen() {
  const params = useSearchParams();
  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState("");
  const [inReview, setInReview] = useState(false);
  // While something is in review, check every 20 s so approvals show up on their own.
  const templates = useFetch<TemplateRowDTO[]>("/api/templates", inReview ? 20_000 : undefined);
  const anyInReview = !!templates.data?.some((t) => t.status === "PENDING" || t.status === "IN_APPEAL");
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

  const q = search.trim().toLowerCase();
  const rows = templates.data?.filter((t) => FILTERS[filter].match(t.status) && (!q || t.name.includes(q) || t.draft.body.text.toLowerCase().includes(q)));
  const submitted = params.get("submitted");
  const updated = params.get("updated");

  return (
    <Page
      title="Templates"
      subtitle="Your WhatsApp message templates. Changes here also appear in WhatsApp Manager, and every new or edited template is reviewed by WhatsApp."
      actions={
        <Link href="/templates/new" className="btn-primary">
          New template
        </Link>
      }
    >
      {(submitted || updated) && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <b>{submitted ?? updated}</b> was {submitted ? "submitted" : "updated"} and sent for review. WhatsApp usually decides within minutes, sometimes up to 24 hours. This page refreshes itself.
        </div>
      )}
      <ErrorNote>{error ?? templates.error}</ErrorNote>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" type="search" placeholder="Search templates…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {FILTERS.map((f, i) => (
          <button key={f.label} className={`chip ${filter === i ? "chip-active" : ""}`} onClick={() => setFilter(i)}>
            {f.label}
            {templates.data && <span className="ml-1 opacity-60">{templates.data.filter((t) => f.match(t.status)).length}</span>}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Template</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Message</th>
              <th className="px-3 py-2 font-medium">Quality</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows?.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500">
                    {t.language} · {t.category.toLowerCase()}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <TemplateStatusBadge status={t.status} />
                  {t.rejectedReason && (
                    <div className="mt-1 max-w-[14rem] text-xs text-red-700">{REJECTION_REASON[t.rejectedReason] ?? t.rejectedReason.toLowerCase().replace(/_/g, " ")}</div>
                  )}
                </td>
                <td className="max-w-md px-3 py-2 text-xs text-slate-600">
                  <p className="line-clamp-2">{t.draft.body.text}</p>
                  {t.draft.header.type !== "NONE" && <span className="text-slate-400">Header: {t.draft.header.type.toLowerCase()} · </span>}
                  {t.draft.buttons.length > 0 && <span className="text-slate-400">{t.draft.buttons.length} button{t.draft.buttons.length > 1 ? "s" : ""}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{(t.quality && QUALITY[t.quality]) ?? "–"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {t.status === "APPROVED" && (
                      <Link className="btn" href={`/campaigns/new?template=${encodeURIComponent(`${t.name}|${t.language}`)}`}>
                        Use
                      </Link>
                    )}
                    {t.editable ? (
                      <Link className="btn" href={`/templates/${t.id}`}>
                        Edit
                      </Link>
                    ) : (
                      <Link className="btn" href={`/templates/${t.id}`}>
                        View
                      </Link>
                    )}
                    <button className="btn" onClick={() => remove(t)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  {templates.data?.length ? "No templates match." : "No templates yet. Create your first one."}
                </td>
              </tr>
            )}
            {!templates.data && !templates.error && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  Loading templates from WhatsApp…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
