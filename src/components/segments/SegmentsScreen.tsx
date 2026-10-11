"use client";

import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber } from "@/lib/format";
import type { SegmentDTO } from "@/lib/marketing/segment-service";
import { EMPTY_RULES, type SegmentRules } from "@/lib/marketing/segments";
import { ErrorNote, Page } from "../ui/Page";
import { SegmentEditor } from "./SegmentEditor";

export function SegmentsScreen() {
  const segments = useFetch<SegmentDTO[]>("/api/segments");
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string; rules: SegmentRules } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(s: SegmentDTO) {
    if (!confirm(`Delete the segment "${s.name}"? Contacts aren't affected.`)) return;
    try {
      await api.request("DELETE", `/api/segments/${s.id}`);
      segments.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <Page
      title="Segments"
      subtitle="Saved audiences for campaigns. Only opted-in contacts are ever included, and rules are re-checked when a campaign sends."
      actions={
        <button className="btn-primary" onClick={() => setEditing({ name: "", description: "", rules: EMPTY_RULES })}>
          New segment
        </button>
      }
    >
      <ErrorNote>{error ?? segments.error}</ErrorNote>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <div className="text-sm font-semibold">All opted-in contacts</div>
          <p className="mt-1 text-xs text-slate-500">Built in. Everyone who agreed to marketing messages.</p>
        </div>
        {segments.data?.map((s) => (
          <div key={s.id} className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                {s.description && <div className="text-xs text-slate-500">{s.description}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold">{compactNumber(s.size)}</div>
                <div className="text-[11px] text-slate-500">contacts now</div>
              </div>
            </div>
            <p className="mt-2 flex-1 text-xs text-slate-600">{s.summary}</p>
            <div className="mt-3 flex gap-2">
              <button
                className="btn"
                onClick={() => setEditing({ id: s.id, name: s.name, description: s.description ?? "", rules: s.rules })}
              >
                Edit
              </button>
              <button className="btn" onClick={() => remove(s)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {segments.data?.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          No segments yet. Create one to target, say, VIP customers who were active in the last 30 days.
        </p>
      )}

      {editing && (
        <SegmentEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            segments.reload();
          }}
        />
      )}
    </Page>
  );
}
