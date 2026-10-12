"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { classLabel, compactNumber, relativeTime } from "@/lib/format";
import type { ContactRowDTO } from "@/lib/marketing/contacts";
import type { OptInStatusName } from "@/lib/types";
import { Card, ErrorNote, Page } from "../ui/Page";
import { ContactDetailsDialog } from "./ContactDetailsDialog";
import { ImportDialog } from "./ImportDialog";
import { OptInBadge } from "./OptInBadge";

type Filters = { q: string; status: OptInStatusName | ""; tag: string };
type ListResponse = { contacts: ContactRowDTO[]; total: number; nextCursor: string | null };
type TagsResponse = { tags: { tag: string; count: number }[]; fields: string[] };

const STATUS_FILTERS: { value: Filters["status"]; label: string }[] = [
  { value: "", label: "All" },
  { value: "OPTED_IN", label: "Opted in" },
  { value: "OPTED_OUT", label: "Opted out" },
  { value: "UNKNOWN", label: "Not asked" },
];

function query(f: Filters, cursor?: string | null) {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.status) p.set("status", f.status);
  if (f.tag) p.set("tag", f.tag);
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

export function ContactsScreen() {
  const [filters, setFilters] = useState<Filters>({ q: "", status: "", tag: "" });
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const tags = useFetch<TagsResponse>("/api/contacts/tags");

  // First page via useFetch; "Load more" pages are remembered per filter combination,
  // and row edits are kept as local overrides on top.
  const key = query(filters);
  const first = useFetch<ListResponse>(`/api/contacts?${key}`);
  const [more, setMore] = useState<{ key: string; pages: ListResponse[] }>({ key: "", pages: [] });
  const [edits, setEdits] = useState<Record<string, Partial<ContactRowDTO>>>({});
  const [moreError, setMoreError] = useState<string | null>(null);

  const pages = first.data ? [first.data, ...(more.key === key ? more.pages : [])] : [];
  const last = pages[pages.length - 1];
  const list: ListResponse | null = first.data
    ? {
        total: first.data.total,
        nextCursor: last.nextCursor,
        contacts: pages.flatMap((p) => p.contacts).map((c) => ({ ...c, ...edits[c.id] })),
      }
    : null;
  const error = first.error ?? moreError;

  // Search once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function loadMore() {
    if (!list?.nextCursor) return;
    try {
      const page = await api.get<ListResponse>(`/api/contacts?${query(filters, list.nextCursor)}`);
      setMore((m) => ({ key, pages: [...(m.key === key ? m.pages : []), page] }));
      setMoreError(null);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Could not load more contacts");
    }
  }

  /** Apply a change to one row locally after saving it. */
  function patchRow(id: string, change: Partial<ContactRowDTO>) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...change } }));
  }

  function reloadAll() {
    setMore({ key: "", pages: [] });
    setEdits({});
    first.reload();
    tags.reload();
  }

  return (
    <Page
      title="Contacts"
      subtitle={list ? `${compactNumber(list.total)} contact${list.total === 1 ? "" : "s"}` : "Your WhatsApp audience"}
      actions={
        <button className="btn-primary" onClick={() => setImporting(true)}>
          Import CSV
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          type="search"
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.label}
              className={`chip ${filters.status === s.value ? "chip-active" : ""}`}
              onClick={() => setFilters({ ...filters, status: s.value })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          value={filters.tag}
          aria-label="Filter by tag"
          onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
        >
          <option value="">Any tag</option>
          {tags.data?.tags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag} ({t.count})
            </option>
          ))}
        </select>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">School · Class</th>
              <th className="px-3 py-2 font-medium">Tags</th>
              <th className="px-3 py-2 font-medium">Marketing</th>
              <th className="px-3 py-2 font-medium">Last message</th>
              <th className="px-3 py-2 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {list?.contacts.map((c) => (
              <ContactRow key={c.id} contact={c} onChanged={(change) => patchRow(c.id, change)} onTagsChanged={tags.reload} />
            ))}
            {list && !list.contacts.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  No contacts match. Import a CSV, or wait for customers to message you on WhatsApp.
                </td>
              </tr>
            )}
            {!list && !error && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {list?.nextCursor && (
        <div className="mt-3 text-center">
          <button className="btn" onClick={loadMore}>
            Load more
          </button>
        </div>
      )}

      <OptInApiHelp />

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={reloadAll}
        />
      )}
    </Page>
  );
}

function ContactRow({
  contact: c,
  onChanged,
  onTagsChanged,
}: {
  contact: ContactRowDTO;
  onChanged: (change: Partial<ContactRowDTO>) => void;
  onTagsChanged: () => void;
}) {
  const [editingTags, setEditingTags] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [tagText, setTagText] = useState(c.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(change: { tags?: string[]; optInStatus?: "OPTED_IN" | "OPTED_OUT" }) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/contacts/${c.id}`, change);
      onChanged({
        ...(change.tags && { tags: change.tags }),
        ...(change.optInStatus && { optInStatus: change.optInStatus, optInSource: "manual" }),
      });
      if (change.tags) onTagsChanged();
      setEditingTags(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  function optIn() {
    if (confirm(`Only opt ${c.name ?? c.phone} in if they agreed to receive WhatsApp marketing messages from you. Continue?`)) {
      save({ optInStatus: "OPTED_IN" });
    }
  }

  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="px-3 py-2">
        <button className="text-left font-medium hover:underline" onClick={() => setEditingDetails(true)} title="Edit details">
          {c.name || <span className="text-slate-400">No name</span>}
        </button>
        <div className="text-xs text-slate-500">{c.phone ?? "—"}</div>
        {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
        {editingDetails && (
          <ContactDetailsDialog contactId={c.id} contact={c} onClose={() => setEditingDetails(false)} onSaved={(details) => onChanged(details)} />
        )}
      </td>
      <td className="px-3 py-2">
        <button className="text-left text-xs" onClick={() => setEditingDetails(true)} title="Edit school and class">
          {c.attributes.school || c.attributes.class ? (
            <>
              <div className="text-slate-700">{String(c.attributes.school ?? "—")}</div>
              {classLabel(c.attributes.class) && <div className="text-slate-500">{classLabel(c.attributes.class)}</div>}
            </>
          ) : (
            <span className="text-slate-400 hover:text-slate-600">+ Add</span>
          )}
        </button>
      </td>
      <td className="px-3 py-2">
        {editingTags ? (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              save({ tags: tagText.split(",").map((t) => t.trim()).filter(Boolean) });
            }}
          >
            <input className="input py-1" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="vip, diwali" autoFocus />
            <button className="btn" disabled={busy}>
              Save
            </button>
          </form>
        ) : (
          <button className="flex flex-wrap gap-1 text-left" onClick={() => setEditingTags(true)} title="Edit tags">
            {c.tags.length ? (
              c.tags.map((t) => (
                <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                  {t}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400 hover:text-slate-600">+ Add tags</span>
            )}
          </button>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <OptInBadge status={c.optInStatus} />
          {c.optInStatus === "OPTED_IN" ? (
            <button className="text-xs text-slate-500 underline hover:text-slate-800" disabled={busy} onClick={() => save({ optInStatus: "OPTED_OUT" })}>
              Opt out
            </button>
          ) : (
            <button className="text-xs text-slate-500 underline hover:text-slate-800" disabled={busy} onClick={optIn}>
              Opt in
            </button>
          )}
        </div>
        {c.optInSource && <div className="mt-0.5 text-[11px] text-slate-400">via {c.optInSource}</div>}
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">{c.lastActiveAt ? relativeTime(c.lastActiveAt) : "Never"}</td>
      <td className="px-3 py-2 text-xs text-slate-500">{relativeTime(c.createdAt)}</td>
    </tr>
  );
}

const noSubscribe = () => () => {};

function OptInApiHelp() {
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "https://your-app.example.com",
  );

  return (
    <Card title="Collect opt-ins from your website" className="mt-6">
      <p className="text-sm text-slate-600">
        When someone ticks &ldquo;Send me offers on WhatsApp&rdquo; on your site, have your backend call this endpoint. They&apos;re
        added (or updated) and opted in. Set <code className="rounded bg-slate-100 px-1">API_KEY</code> in your environment
        first. Never call it from the browser, because that would expose the key.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
        {`curl -X POST ${origin}/api/contacts/opt-in \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"phone":"+919812345678","name":"Asha","school":"Delhi Public School","class":"8","tags":["website"]}'`}
      </pre>
      <p className="mt-2 text-xs text-slate-500">
        Send <code>&quot;optedIn&quot;: false</code> to record an opt-out instead. Full details: docs/OPT_IN_API.md
      </p>
    </Card>
  );
}
