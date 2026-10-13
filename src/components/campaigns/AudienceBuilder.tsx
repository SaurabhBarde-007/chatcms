"use client";

import {
  Ban,
  Bookmark,
  CalendarClock,
  CalendarPlus,
  GraduationCap,
  List,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  School,
  Search,
  Smartphone,
  Tag,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { fieldLabel } from "@/lib/format";
import {
  type AudienceFilter,
  audienceFilterSchema,
  describeFilter,
  TEXT_OP_LABELS,
  TEXT_OPS,
  type TextField,
  textFieldLabel,
  type TextOp,
  VALUELESS_OPS,
} from "@/lib/marketing/audience";
import { BUILTIN_ATTRIBUTES } from "@/lib/marketing/templates";

export type SegmentOption = { id: string; name: string; size: number };
type Suggestion = { value: string; count: number };
type TagCount = { tag: string; count: number };
type Group = "Quick filters" | "Attributes" | "Custom attributes";
type MenuItem = { key: string; label: string; group: Group; icon: LucideIcon; create: () => AudienceFilter; disabled?: string };

const text = (field: TextField, op: TextOp): AudienceFilter => ({ kind: "text", field, op, values: [] });

function menuItems(fields: string[], segments: SegmentOption[]): MenuItem[] {
  return [
    { key: "tags", label: "Tags", group: "Quick filters", icon: Tag, create: () => ({ kind: "tags", op: "any", values: [] }) },
    { key: "created", label: "Created date", group: "Quick filters", icon: CalendarPlus, create: () => ({ kind: "date", field: "created", op: "within_days", days: 30 }) },
    { key: "last_seen", label: "Last seen", group: "Quick filters", icon: CalendarClock, create: () => ({ kind: "date", field: "last_seen", op: "within_days", days: 30 }) },
    { key: "opted_in", label: "Opted in", group: "Quick filters", icon: Smartphone, create: () => ({ kind: "opted_in", value: true }) },
    {
      key: "segment",
      label: "Segment",
      group: "Quick filters",
      icon: Bookmark,
      create: () => ({ kind: "segment", op: "in", segmentId: segments[0]?.id ?? "" }),
      disabled: segments.length ? undefined : "No saved segments yet",
    },
    { key: "first_name", label: "First name", group: "Attributes", icon: User, create: () => text("first_name", "is") },
    { key: "name", label: "Name", group: "Attributes", icon: User, create: () => text("name", "contains") },
    { key: "phone", label: "Mobile number", group: "Attributes", icon: Smartphone, create: () => text("phone", "starts_with") },
    { key: "email", label: "Email", group: "Attributes", icon: Mail, create: () => text("email", "contains") },
    { key: "school", label: "School", group: "Attributes", icon: School, create: () => text("attr:school", "is") },
    { key: "class", label: "Class", group: "Attributes", icon: GraduationCap, create: () => text("attr:class", "is") },
    { key: "messaged_us", label: "Messaged us", group: "Attributes", icon: MessageSquare, create: () => ({ kind: "messaged_us", value: true }) },
    ...fields
      .filter((f) => !BUILTIN_ATTRIBUTES.includes(f))
      .map((f): MenuItem => ({ key: `attr:${f}`, label: fieldLabel(f), group: "Custom attributes", icon: List, create: () => text(`attr:${f}`, "is") })),
  ];
}

function iconFor(f: AudienceFilter): LucideIcon {
  switch (f.kind) {
    case "opted_in":
      return Smartphone;
    case "messaged_us":
      return MessageSquare;
    case "tags":
      return Tag;
    case "segment":
      return Bookmark;
    case "date":
      return f.field === "created" ? CalendarPlus : CalendarClock;
    case "text":
      return f.field === "attr:school" ? School : f.field === "attr:class" ? GraduationCap : f.field === "email" ? Mail : f.field === "phone" ? Smartphone : f.field.startsWith("attr:") ? List : User;
  }
}

/**
 * "Select audience": filters that must all match, shown as chips. "Blocked is No" is fixed:
 * blocked contacts never get messages.
 */
export function AudienceBuilder({
  filters,
  onChange,
  tags,
  fields,
  segments,
}: {
  filters: AudienceFilter[];
  onChange: (filters: AudienceFilter[]) => void;
  tags: TagCount[];
  fields: string[];
  segments: SegmentOption[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ index: number | null; draft: AudienceFilter } | null>(null);
  const segmentNames = Object.fromEntries(segments.map((s) => [s.id, s.name]));

  function open(item: MenuItem) {
    setMenuOpen(false);
    // Only one opted-in filter: edit the existing one.
    const existing = item.key === "opted_in" ? filters.findIndex((f) => f.kind === "opted_in") : -1;
    setEditing(existing >= 0 ? { index: existing, draft: filters[existing] } : { index: null, draft: item.create() });
  }

  function apply(f: AudienceFilter) {
    onChange(editing?.index == null ? [...filters, f] : filters.map((x, i) => (i === editing.index ? f : x)));
    setEditing(null);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Audience filters">
        {filters.map((f, i) => {
          const Icon = iconFor(f);
          return (
            <span key={i} className="contents">
              {i > 0 && <span className="text-xs text-slate-400">and</span>}
              <span
                className={`inline-flex items-center rounded-md border text-sm ${editing?.index === i ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"}`}
              >
                <button type="button" className="flex items-center gap-1.5 py-1 pr-1 pl-2 text-left" onClick={() => setEditing({ index: i, draft: f })} title="Change">
                  <Icon size={14} className="shrink-0 text-slate-500" aria-hidden />
                  {describeFilter(f, segmentNames)}
                </button>
                <button
                  type="button"
                  className="px-1.5 py-1 text-slate-400 hover:text-slate-700"
                  onClick={() => {
                    onChange(filters.filter((_, j) => j !== i));
                    setEditing(null);
                  }}
                  aria-label={`Remove filter: ${describeFilter(f, segmentNames)}`}
                >
                  <X size={13} />
                </button>
              </span>
            </span>
          );
        })}
        {filters.length > 0 && <span className="text-xs text-slate-400">and</span>}
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-600"
          title="Blocked contacts never get messages"
        >
          <Ban size={14} className="text-slate-500" aria-hidden /> Blocked is No <Lock size={11} className="text-slate-400" aria-hidden />
        </span>
      </div>

      <div className="relative mt-2">
        <button type="button" className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
          <Plus size={14} /> Add filter
        </button>
        {menuOpen && <FilterMenu items={menuItems(fields, segments)} onPick={open} onClose={() => setMenuOpen(false)} />}
      </div>

      {editing && (
        <FilterEditor
          key={`${editing.index}-${JSON.stringify(editing.draft)}`}
          initial={editing.draft}
          isNew={editing.index === null}
          tags={tags}
          segments={segments}
          onApply={apply}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FilterMenu({ items, onPick, onClose }: { items: MenuItem[]; onPick: (item: MenuItem) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [onClose]);

  const shown = items.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase()));
  const groups: Group[] = ["Quick filters", "Attributes", "Custom attributes"];
  return (
    <div ref={ref} className="absolute top-full left-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white shadow-lg" role="menu">
      <div className="border-b border-slate-100 p-2">
        <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2">
          <Search size={14} className="text-slate-400" aria-hidden />
          <input
            className="w-full bg-transparent py-1.5 text-sm outline-none"
            placeholder="Search filters…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {groups.map((g) => {
          const inGroup = shown.filter((i) => i.group === g);
          if (!inGroup.length) return null;
          return (
            <div key={g}>
              <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{g}</p>
              {inGroup.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => onPick(item)}
                  disabled={!!item.disabled}
                  title={item.disabled}
                >
                  <item.icon size={15} className="text-slate-500" aria-hidden />
                  {item.label}
                </button>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="px-3 py-2 text-sm text-slate-400">No filters match.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editing one filter
// ---------------------------------------------------------------------------

const toLocalDate = (iso: string | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function FilterEditor({
  initial,
  isNew,
  tags,
  segments,
  onApply,
  onCancel,
}: {
  initial: AudienceFilter;
  isNew: boolean;
  tags: TagCount[];
  segments: SegmentOption[];
  onApply: (f: AudienceFilter) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<AudienceFilter>(initial);
  const [pending, setPending] = useState(""); // typed but not yet added as a value
  const [error, setError] = useState<string | null>(null);
  const attrKey = f.kind === "text" && f.field.startsWith("attr:") ? f.field.slice("attr:".length) : null;
  const values = useFetch<Suggestion[]>(attrKey ? `/api/contacts/values?field=${attrKey}` : null);

  function apply() {
    let next = f;
    if ((f.kind === "text" || f.kind === "tags") && pending.trim()) next = { ...f, values: [...f.values, pending.trim()] } as AudienceFilter;
    const parsed = audienceFilterSchema.safeParse(next);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Incomplete filter");
    onApply(parsed.data);
  }

  const title =
    f.kind === "text"
      ? textFieldLabel(f.field)
      : f.kind === "date"
        ? f.field === "created"
          ? "Created date"
          : "Last seen"
        : { opted_in: "Opted in", messaged_us: "Messaged us", tags: "Tags", segment: "Segment" }[f.kind];

  let body;
  switch (f.kind) {
    case "opted_in":
      body = (
        <>
          <select className="input w-auto" value={String(f.value)} onChange={(e) => setF({ ...f, value: e.target.value === "true" })} aria-label="Opted in">
            <option value="true">is Yes</option>
            <option value="false">is No</option>
          </select>
          {!f.value && (
            <p className="w-full text-xs text-amber-800">
              People who haven&apos;t opted in yet (never anyone who opted out). WhatsApp requires their permission before you message them.
            </p>
          )}
        </>
      );
      break;
    case "messaged_us":
      body = (
        <select className="input w-auto" value={String(f.value)} onChange={(e) => setF({ ...f, value: e.target.value === "true" })} aria-label="Messaged us">
          <option value="true">is Yes (has written to us)</option>
          <option value="false">is No (never written to us)</option>
        </select>
      );
      break;
    case "segment":
      body = (
        <>
          <select className="input w-auto" value={f.op} onChange={(e) => setF({ ...f, op: e.target.value as "in" | "not_in" })} aria-label="Operator">
            <option value="in">is</option>
            <option value="not_in">is not</option>
          </select>
          <select className="input w-auto" value={f.segmentId} onChange={(e) => setF({ ...f, segmentId: e.target.value })} aria-label="Segment">
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.size.toLocaleString()})
              </option>
            ))}
          </select>
        </>
      );
      break;
    case "date": {
      const ops =
        f.field === "created"
          ? ([
              ["within_days", "in the last"],
              ["not_within_days", "more than … ago"],
              ["after", "on or after"],
              ["before", "before"],
            ] as const)
          : ([
              ["within_days", "in the last"],
              ["not_within_days", "not in the last"],
              ["never", "never (hasn't messaged us)"],
              ["after", "on or after"],
              ["before", "before"],
            ] as const);
      const usesDays = f.op === "within_days" || f.op === "not_within_days";
      body = (
        <>
          <select
            className="input w-auto"
            value={f.op}
            onChange={(e) => {
              const op = e.target.value as typeof f.op;
              setF({ ...f, op, days: op.endsWith("days") ? (f.days ?? 30) : undefined, date: op === "after" || op === "before" ? (f.date ?? new Date().toISOString()) : undefined });
            }}
            aria-label="Operator"
          >
            {ops.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {usesDays && (
            <label className="flex items-center gap-1.5 text-sm">
              <input
                className="input w-20"
                inputMode="numeric"
                value={f.days ?? ""}
                onChange={(e) => setF({ ...f, days: Number(e.target.value.replace(/\D/g, "")) || undefined })}
                aria-label="Days"
              />
              days
            </label>
          )}
          {(f.op === "after" || f.op === "before") && (
            <input
              type="date"
              className="input w-auto"
              value={toLocalDate(f.date)}
              onChange={(e) => e.target.value && setF({ ...f, date: new Date(`${e.target.value}T00:00:00`).toISOString() })}
              aria-label="Date"
            />
          )}
        </>
      );
      break;
    }
    case "tags":
      body = (
        <>
          <select className="input w-auto" value={f.op} onChange={(e) => setF({ ...f, op: e.target.value as typeof f.op })} aria-label="Operator">
            <option value="any">has any of</option>
            <option value="all">has all of</option>
            <option value="none">has none of</option>
          </select>
          <ValuesInput values={f.values} onChange={(v) => setF({ ...f, values: v })} pending={pending} onPending={setPending} suggestions={tags.map((t) => ({ value: t.tag, count: t.count }))} placeholder="Type a tag…" />
        </>
      );
      break;
    case "text": {
      const needsValue = !VALUELESS_OPS.includes(f.op);
      body = (
        <>
          <select className="input w-auto" value={f.op} onChange={(e) => setF({ ...f, op: e.target.value as typeof f.op })} aria-label="Operator">
            {TEXT_OPS.map((op) => (
              <option key={op} value={op}>
                {TEXT_OP_LABELS[op]}
              </option>
            ))}
          </select>
          {needsValue && (
            <ValuesInput
              values={f.values}
              onChange={(v) => setF({ ...f, values: v })}
              pending={pending}
              onPending={setPending}
              suggestions={values.data ?? []}
              placeholder={f.field === "phone" ? "e.g. 91 (India) or a full number" : f.field === "attr:class" ? "e.g. 10" : "Type a value…"}
            />
          )}
          {needsValue && <p className="w-full text-[11px] text-slate-500">Several values match any of them. Capital letters don&apos;t matter.</p>}
        </>
      );
      break;
    }
  }

  return (
    <div className="mt-3 rounded-md border border-teal-200 bg-teal-50/40 p-3" role="group" aria-label={`Filter: ${title}`}>
      <p className="mb-2 text-xs font-semibold text-slate-600">{title}</p>
      <div className="flex flex-wrap items-start gap-2">{body}</div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn-primary py-1" onClick={apply}>
          {isNew ? "Add filter" : "Apply"}
        </button>
        <button type="button" className="btn py-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Several values as chips; Enter or comma adds one. Suggestions show existing values with counts. */
function ValuesInput({
  values,
  onChange,
  pending,
  onPending,
  suggestions,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  pending: string;
  onPending: (text: string) => void;
  suggestions: Suggestion[];
  placeholder: string;
}) {
  const add = (v: string) => {
    const value = v.trim();
    if (value && !values.some((x) => x.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    onPending("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(pending);
    } else if (e.key === "Backspace" && !pending && values.length) onChange(values.slice(0, -1));
  };
  const q = pending.trim().toLowerCase();
  const shown = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.value.toLowerCase()) && s.value.toLowerCase().includes(q)).slice(0, 12);

  return (
    <div className="min-w-56 flex-1">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-1">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-0.5 rounded bg-slate-100 py-0.5 pr-0.5 pl-1.5 text-xs">
            {v}
            <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 py-0.5 text-sm outline-none"
          value={pending}
          onChange={(e) => onPending(e.target.value)}
          onKeyDown={onKey}
          placeholder={values.length ? "" : placeholder}
          aria-label="Filter value"
          autoFocus
        />
      </div>
      {shown.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {shown.map((s) => (
            <button key={s.value} type="button" className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:border-teal-300" onClick={() => add(s.value)}>
              {s.value} <span className="text-slate-400">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
