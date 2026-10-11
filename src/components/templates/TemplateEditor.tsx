"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import type { TemplateRowDTO } from "@/lib/marketing/template-admin";
import {
  type DraftButton,
  type DraftHeader,
  EMPTY_DRAFT,
  LANGUAGES,
  LIMITS,
  type MediaFormat,
  nextPlaceholder,
  type TemplateDraft,
  toTemplateName,
  validateDraft,
} from "@/lib/marketing/template-builder";
import { placeholders } from "@/lib/marketing/templates";
import { Card, ErrorNote, Page } from "../ui/Page";
import { TemplatePreview } from "./TemplatePreview";
import { REJECTION_REASON, TemplateStatusBadge } from "./TemplateStatusBadge";

const HEADER_TYPES: { value: DraftHeader["type"]; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "TEXT", label: "Text" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "DOCUMENT", label: "Document" },
];
const ACCEPT: Record<MediaFormat, string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // what fits through Vercel; bigger files → use a link

/** Create a template (no id) or edit / view an existing one. */
export function TemplateEditor({ id }: { id?: string }) {
  const router = useRouter();
  const mode = id ? "edit" : "create";
  const existing = useFetch<TemplateRowDTO>(id ? `/api/templates/${id}` : null);

  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (existing.data && loadedId !== existing.data.id) {
    setLoadedId(existing.data.id);
    setDraft(existing.data.draft);
  }

  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaLink, setMediaLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [varName, setVarName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Where the cursor is in the message box (kept up to date, so toolbar buttons insert at it),
  // and where to put it after an insert (applied right after React updates the text).
  const caret = useRef({ start: 0, end: 0 });
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && pendingCaret.current !== null) {
      el.focus();
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      caret.current = { start: pendingCaret.current, end: pendingCaret.current };
      pendingCaret.current = null;
    }
  });

  const readOnly = mode === "edit" && existing.data ? !existing.data.editable : false;
  const problems = validateDraft(draft, mode);
  const update = (change: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...change }));
  const setBody = (text: string) => setDraft((d) => ({ ...d, body: { ...d.body, text } }));

  // ---- body helpers ----------------------------------------------------------

  function insert(snippet: string, wrapWith?: string) {
    const text = draft.body.text;
    const start = Math.min(caret.current.start, text.length);
    const end = Math.min(caret.current.end, text.length);
    const selected = text.slice(start, end);
    const piece = wrapWith ? `${wrapWith}${selected || "text"}${wrapWith}` : snippet;
    pendingCaret.current = start + piece.length;
    setBody(text.slice(0, start) + piece + text.slice(end));
  }

  function trackCaret() {
    const el = bodyRef.current;
    if (el) caret.current = { start: el.selectionStart, end: el.selectionEnd };
  }

  function addVariable() {
    if (draft.parameterFormat === "NAMED" && !varName.trim()) return;
    insert(nextPlaceholder(draft, varName));
    setVarName("");
  }

  // ---- header media ------------------------------------------------------------

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError("That file is over 4 MB. Put it online and paste its link below instead.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/templates/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      setDraft((d) => ({ ...d, header: { type: d.header.type as MediaFormat, handle: data.handle } }));
      setMediaPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function uploadLink() {
    if (!mediaLink.trim()) return;
    setError(null);
    setUploading(true);
    try {
      const { handle } = await api.post<{ handle: string }>("/api/templates/media", { url: mediaLink.trim() });
      setDraft((d) => ({ ...d, header: { type: d.header.type as MediaFormat, handle } }));
      setMediaPreview(draft.header.type === "IMAGE" ? mediaLink.trim() : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function setHeaderType(type: DraftHeader["type"]) {
    setMediaPreview(null);
    update({ header: type === "NONE" ? { type } : type === "TEXT" ? { type, text: "", example: "" } : { type } });
  }

  // ---- buttons -------------------------------------------------------------------

  const setButton = (i: number, b: DraftButton) => update({ buttons: draft.buttons.map((x, j) => (j === i ? b : x)) });
  const addButton = (b: DraftButton) => update({ buttons: [...draft.buttons, b] });
  const moveButton = (i: number, dir: -1 | 1) => {
    const next = [...draft.buttons];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    update({ buttons: next });
  };
  const count = (t: DraftButton["type"]) => draft.buttons.filter((b) => b.type === t).length;

  // ---- submit ----------------------------------------------------------------------

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        await api.post("/api/templates", draft);
        router.push(`/templates?submitted=${encodeURIComponent(draft.name)}`);
      } else {
        await api.patch(`/api/templates/${id}`, draft);
        router.push(`/templates?updated=${encodeURIComponent(draft.name)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  if (mode === "edit" && !existing.data) {
    return (
      <Page title="Template">
        <ErrorNote>{existing.error}</ErrorNote>
        {!existing.error && <p className="text-sm text-slate-400">Loading from WhatsApp…</p>}
      </Page>
    );
  }

  const bodyVars = placeholders(draft.body.text);
  const h = draft.header;
  const status = existing.data?.status;

  return (
    <Page
      title={mode === "create" ? "New template" : <span className="flex flex-wrap items-center gap-2">{draft.name} {status && <TemplateStatusBadge status={status} />}</span>}
      subtitle={<Link href="/templates" className="hover:underline">← Templates</Link>}
    >
      {existing.data?.rejectedReason && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <b>Rejected:</b> {REJECTION_REASON[existing.data.rejectedReason] ?? existing.data.rejectedReason}. Fix it below and resubmit.
        </div>
      )}
      {readOnly && (
        <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          This template is {status === "PENDING" ? "in review" : status?.toLowerCase().replace(/_/g, " ")}, so it can&apos;t be edited right now. WhatsApp only allows editing approved, rejected or paused templates.
        </div>
      )}
      {mode === "edit" && status === "APPROVED" && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Approved templates can be edited <b>once a day and 10 times a month</b>. After saving, WhatsApp reviews the template again.
        </div>
      )}

      <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-5">
          <Card title="Basics">
            <div className="grid gap-3 sm:grid-cols-2">
              {mode === "create" ? (
                <>
                  <Field label="Name" hint="Lowercase, numbers and _ only. Can't be changed later.">
                    <input className="input" value={draft.name} onChange={(e) => update({ name: typingName(e.target.value) })} onBlur={() => update({ name: toTemplateName(draft.name) })} placeholder="diwali_offer_2026" />
                  </Field>
                  <Field label="Language">
                    <select className="input" value={draft.language} onChange={(e) => update({ language: e.target.value })}>
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label} ({l.code})
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : (
                <Field label="Name · language">
                  <p className="py-2 text-sm">
                    {draft.name} · {draft.language}
                  </p>
                </Field>
              )}
              <Field label="Category">
                <div className="flex gap-4 py-2 text-sm">
                  {(["MARKETING", "UTILITY"] as const).map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <input type="radio" checked={draft.category === c} onChange={() => update({ category: c })} />
                      {c === "MARKETING" ? "Marketing" : "Utility"}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  {draft.category === "MARKETING"
                    ? "Offers, announcements, newsletters. Only to opted-in contacts."
                    : "Updates about something the customer did (orders, bookings, account). No promotions."}
                </p>
              </Field>
              {mode === "create" && (
                <Field label="Variables look like">
                  <select
                    className="input"
                    value={draft.parameterFormat}
                    onChange={(e) => update({ parameterFormat: e.target.value as TemplateDraft["parameterFormat"], body: { ...draft.body, examples: {} } })}
                  >
                    <option value="POSITIONAL">Numbers: {"{{1}}, {{2}}"}</option>
                    <option value="NAMED">Names: {"{{first_name}}"}</option>
                  </select>
                </Field>
              )}
            </div>
          </Card>

          <Card title="Header (optional)">
            <div className="flex flex-wrap gap-1.5">
              {HEADER_TYPES.map((t) => (
                <button key={t.value} type="button" className={`chip ${h.type === t.value ? "chip-active" : ""}`} onClick={() => setHeaderType(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
            {h.type === "TEXT" && (
              <div className="mt-3 space-y-2">
                <Counter value={h.text} max={LIMITS.headerText}>
                  <input className="input" value={h.text} onChange={(e) => update({ header: { ...h, text: e.target.value } })} placeholder="Diwali sale is here" />
                </Counter>
                {placeholders(h.text).length === 0 ? (
                  <button type="button" className="text-xs text-slate-500 underline" onClick={() => update({ header: { ...h, text: `${h.text}${h.text && !h.text.endsWith(" ") ? " " : ""}${draft.parameterFormat === "NAMED" ? "{{name}}" : "{{1}}"}` } })}>
                    + Add a variable
                  </button>
                ) : (
                  <Field label={`Sample for ${placeholders(h.text)[0] ? `{{${placeholders(h.text)[0]}}}` : "the variable"}`}>
                    <input className="input" value={h.example} onChange={(e) => update({ header: { ...h, example: e.target.value } })} placeholder="e.g. Asha" />
                  </Field>
                )}
              </div>
            )}
            {h.type !== "NONE" && h.type !== "TEXT" && (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-xs text-slate-500">
                  WhatsApp needs a sample {h.type.toLowerCase()} for review. When you send a campaign you choose the actual file.
                </p>
                <input type="file" accept={ACCEPT[h.type]} onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} className="text-sm" />
                <div className="flex gap-2">
                  <input className="input" value={mediaLink} onChange={(e) => setMediaLink(e.target.value)} placeholder="…or paste a public https:// link (for files over 4 MB)" />
                  <button type="button" className="btn shrink-0" onClick={uploadLink} disabled={uploading || !mediaLink.trim()}>
                    Use link
                  </button>
                </div>
                <p className="text-xs">
                  {uploading ? "Uploading to WhatsApp…" : h.handle ? "✓ Sample uploaded" : h.sampleUrl ? "Current sample kept (re-uploaded on save)" : <span className="text-slate-500">No sample yet</span>}
                </p>
              </div>
            )}
          </Card>

          <Card title="Message">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn px-2 font-bold" title="Bold" onClick={() => insert("", "*")}>
                B
              </button>
              <button type="button" className="btn px-2 italic" title="Italic" onClick={() => insert("", "_")}>
                I
              </button>
              <button type="button" className="btn px-2 line-through" title="Strikethrough" onClick={() => insert("", "~")}>
                S
              </button>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              {draft.parameterFormat === "NAMED" && (
                <input className="input w-36 py-1" value={varName} onChange={(e) => setVarName(e.target.value)} placeholder="variable name" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addVariable())} />
              )}
              <button type="button" className="btn" onClick={addVariable} disabled={draft.parameterFormat === "NAMED" && !varName.trim()}>
                + Add variable
              </button>
            </div>
            <Counter value={draft.body.text} max={LIMITS.body}>
              <textarea
                ref={bodyRef}
                className="input min-h-36 font-[inherit]"
                value={draft.body.text}
                onChange={(e) => {
                  setBody(e.target.value);
                  caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
                }}
                onSelect={trackCaret}
                placeholder={draft.parameterFormat === "NAMED" ? "Hi {{first_name}}, our Diwali sale is on! Get {{discount}} off everything until Sunday." : "Hi {{1}}, our Diwali sale is on! Get {{2}} off everything until Sunday."}
              />
            </Counter>
            {bodyVars.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-500">Sample values (WhatsApp reviewers see these; they aren&apos;t sent to customers):</p>
                {bodyVars.map((v) => (
                  <div key={v} className="grid grid-cols-[8rem_1fr] items-center gap-2">
                    <span className="text-sm font-medium">{`{{${v}}}`}</span>
                    <input
                      className="input"
                      value={draft.body.examples[v] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, body: { ...d.body, examples: { ...d.body.examples, [v]: e.target.value } } }))}
                      placeholder="e.g. Asha"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Footer (optional)">
            <Counter value={draft.footer} max={LIMITS.footer}>
              <input className="input" value={draft.footer} onChange={(e) => update({ footer: e.target.value })} placeholder="Tap Stop promotions to unsubscribe" />
            </Counter>
          </Card>

          <Card title="Buttons (optional)">
            <div className="space-y-3">
              {draft.buttons.map((b, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                    <span>
                      {i + 1}. {b.type === "QUICK_REPLY" ? "Quick reply" : b.type === "URL" ? "Website" : b.type === "PHONE_NUMBER" ? "Call" : "Copy code"}
                    </span>
                    <span className="flex gap-1">
                      <button type="button" className="btn px-2 py-0.5" onClick={() => moveButton(i, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" className="btn px-2 py-0.5" onClick={() => moveButton(i, 1)} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" className="btn px-2 py-0.5" onClick={() => update({ buttons: draft.buttons.filter((_, j) => j !== i) })} aria-label="Remove">
                        ✕
                      </button>
                    </span>
                  </div>
                  <ButtonFields button={b} onChange={(next) => setButton(i, next)} />
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn" disabled={count("QUICK_REPLY") >= LIMITS.quickReplies || draft.buttons.length >= LIMITS.buttons} onClick={() => addButton({ type: "QUICK_REPLY", text: "" })}>
                  + Quick reply
                </button>
                <button type="button" className="btn" disabled={count("URL") >= LIMITS.urlButtons || draft.buttons.length >= LIMITS.buttons} onClick={() => addButton({ type: "URL", text: "", url: "https://", example: "" })}>
                  + Website
                </button>
                <button type="button" className="btn" disabled={count("PHONE_NUMBER") >= 1 || draft.buttons.length >= LIMITS.buttons} onClick={() => addButton({ type: "PHONE_NUMBER", text: "Call us", phone: "" })}>
                  + Call
                </button>
                <button type="button" className="btn" disabled={count("COPY_CODE") >= 1 || draft.buttons.length >= LIMITS.buttons} onClick={() => addButton({ type: "COPY_CODE", example: "" })}>
                  + Copy code
                </button>
                {draft.category === "MARKETING" && !draft.buttons.some((b) => b.type === "QUICK_REPLY" && /stop/i.test(b.text)) && (
                  <button type="button" className="btn" onClick={() => addButton({ type: "QUICK_REPLY", text: "Stop promotions" })}>
                    + &ldquo;Stop promotions&rdquo;
                  </button>
                )}
              </div>
              {draft.category === "MARKETING" && (
                <p className="text-xs text-slate-500">Tip: a &ldquo;Stop promotions&rdquo; button lets people opt out in one tap. This app records that automatically.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <Card title="Preview">
            <TemplatePreview draft={draft} mediaUrl={mediaPreview} />
          </Card>
          {!readOnly && (
            <Card>
              {problems.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-emerald-800">✓ Ready to submit. WhatsApp reviews it, usually within minutes, sometimes up to 24 hours.</p>
              )}
              <button type="button" className="btn-primary mt-3 w-full" disabled={problems.length > 0 || saving || uploading} onClick={submit}>
                {saving ? "Submitting…" : mode === "create" ? "Submit for review" : "Save & resubmit"}
              </button>
              <div className="mt-2">
                <ErrorNote>{error}</ErrorNote>
              </div>
            </Card>
          )}
        </div>
      </fieldset>
    </Page>
  );
}

/** While typing a name: lowercase, spaces/symbols → "_" (edges are tidied on blur). */
function typingName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").slice(0, LIMITS.name);
}

function ButtonFields({ button: b, onChange }: { button: DraftButton; onChange: (b: DraftButton) => void }) {
  if (b.type === "COPY_CODE") {
    return (
      <Field label="Sample code" hint="The real code is chosen when sending a campaign.">
        <input className="input" value={b.example} maxLength={LIMITS.copyCode} onChange={(e) => onChange({ ...b, example: e.target.value })} placeholder="DIWALI20" />
      </Field>
    );
  }
  const label = (
    <Counter value={b.text} max={LIMITS.buttonText}>
      <input className="input" value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} placeholder="Button label" />
    </Counter>
  );
  if (b.type === "QUICK_REPLY") return label;
  if (b.type === "PHONE_NUMBER") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {label}
        <input className="input" value={b.phone} onChange={(e) => onChange({ ...b, phone: e.target.value })} placeholder="+91 98123 45678" />
      </div>
    );
  }
  const dynamic = placeholders(b.url).length > 0;
  return (
    <div className="space-y-2">
      {label}
      <input className="input" value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value })} placeholder="https://shop.example.com/sale" />
      {dynamic ? (
        <Field label="Sample for the variable at the end of the address">
          <input className="input" value={b.example} onChange={(e) => onChange({ ...b, example: e.target.value })} placeholder="diwali" />
        </Field>
      ) : (
        <button type="button" className="text-xs text-slate-500 underline" onClick={() => onChange({ ...b, url: `${b.url.replace(/\/?$/, "/")}{{1}}` })}>
          + Make the end of the address personal (e.g. a tracking code per customer)
        </button>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Counter({ value, max, children }: { value: string; max: number; children: ReactNode }) {
  return (
    <div>
      {children}
      <div className={`mt-0.5 text-right text-[11px] tabular-nums ${value.length > max ? "text-red-600" : "text-slate-400"}`}>
        {value.length}/{max}
      </div>
    </div>
  );
}
