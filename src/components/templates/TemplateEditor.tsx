"use client";

import { ArrowLeft, Bold, Italic, Plus, Strikethrough, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { TemplateRowDTO } from "@/lib/marketing/template-admin";
import {
  canUseBuiltins,
  type DraftButton,
  type DraftCategory,
  type DraftHeader,
  EMPTY_DRAFT,
  formatDuration,
  LANGUAGES,
  LIMITS,
  type MediaFormat,
  nextPlaceholder,
  normalizeDraft,
  type OtpType,
  type TemplateDraft,
  toTemplateName,
  TTL_RANGES,
  validateDraft,
  withBuiltinSamples,
} from "@/lib/marketing/template-builder";
import type { DraftRowDTO } from "@/lib/marketing/template-drafts";
import { TEMPLATE_STARTERS } from "@/lib/marketing/template-starters";
import { BUILTIN_VARIABLES, builtinVariable, placeholders } from "@/lib/marketing/templates";
import { ErrorNote } from "../ui/Page";
import { TemplatePreview } from "./TemplatePreview";
import { REJECTION_REASON, TemplateStatusBadge } from "./TemplateStatusBadge";

const CATEGORIES: { value: DraftCategory; label: string; help: string }[] = [
  { value: "MARKETING", label: "MARKETING", help: "Offers, announcements, newsletters. Only for opted-in contacts." },
  { value: "UTILITY", label: "UTILITY", help: "Updates about something the customer did: orders, bookings, payments, account." },
  { value: "AUTHENTICATION", label: "AUTHENTICATION", help: "One-time passcodes (OTP). WhatsApp writes the text; you choose how the code is delivered." },
];
const TYPES: { value: DraftHeader["type"]; label: string }[] = [
  { value: "NONE", label: "Text" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "DOCUMENT", label: "Document" },
];
const ACCEPT: Record<MediaFormat, string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // what fits through Vercel; bigger files → use a link
const TTL_UNITS = [
  { label: "seconds", seconds: 1 },
  { label: "minutes", seconds: 60 },
  { label: "hours", seconds: 3600 },
  { label: "days", seconds: 86_400 },
];
type ActionMode = "NONE" | "CTA" | "QUICK" | "ALL";
const isCta = (b: DraftButton) => b.type !== "QUICK_REPLY";

/** Create a template (no id) or edit / view an existing one. */
export function TemplateEditor({ id }: { id?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const mode = id ? "edit" : "create";

  // Where the starting draft comes from: an existing template (edit / ?from= duplicate), a saved
  // draft (?draft=), a starter (?starter=), or blank.
  const fromId = id ?? params.get("from");
  const draftParam = params.get("draft");
  const starter = TEMPLATE_STARTERS.find((s) => s.key === params.get("starter"));

  const [draft, setDraft] = useState<TemplateDraft>(() => (starter ? normalizeDraft(starter.draft) : EMPTY_DRAFT));
  const [draftId, setDraftId] = useState<string | null>(draftParam);
  const [existing, setExisting] = useState<TemplateRowDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(fromId || draftParam));
  useEffect(() => {
    if (!fromId && !draftParam) return;
    let cancelled = false;
    (fromId ? api.get<TemplateRowDTO>(`/api/templates/${fromId}`) : api.get<DraftRowDTO>(`/api/templates/drafts/${draftParam}`))
      .then((row) => {
        if (cancelled) return;
        if ("status" in row) {
          setExisting(id ? row : null);
          setDraft(id ? row.draft : { ...row.draft, name: `${row.name}_copy`.slice(0, LIMITS.name) });
        } else setDraft(row.draft);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Could not load"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fromId, draftParam, id]);

  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaLink, setMediaLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [varName, setVarName] = useState("");
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cursor tracking for the message box (toolbar buttons insert at the cursor).
  const bodyRef = useRef<HTMLTextAreaElement>(null);
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

  const readOnly = mode === "edit" && existing ? !existing.editable : false;
  const isAuth = draft.category === "AUTHENTICATION";
  const problems = validateDraft(draft, mode);
  const update = (change: Partial<TemplateDraft>) => {
    setNotice(null);
    setDraft((d) => withBuiltinSamples({ ...d, ...change }));
  };
  const setAuth = (change: Partial<TemplateDraft["auth"]>) => update({ auth: { ...draft.auth, ...change } });
  const setBody = (text: string) => update({ body: { ...draft.body, text } });

  // ---- message box --------------------------------------------------------------

  function insert(snippet: string, wrapWith?: string) {
    const text = draft.body.text;
    const start = Math.min(caret.current.start, text.length);
    const end = Math.min(caret.current.end, text.length);
    const piece = wrapWith ? `${wrapWith}${text.slice(start, end) || "text"}${wrapWith}` : snippet;
    pendingCaret.current = start + piece.length;
    setBody(text.slice(0, start) + piece + text.slice(end));
  }
  function addVariable() {
    if (draft.parameterFormat === "NAMED" && !varName.trim()) return;
    insert(nextPlaceholder(draft, varName));
    setVarName("");
  }
  /** Built-in variables are named, so a new template without variables switches to {{name}} style. */
  function addBuiltin(name: string) {
    if (draft.parameterFormat !== "NAMED") update({ parameterFormat: "NAMED" });
    insert(`{{${name}}}`);
  }
  const builtinsAllowed = canUseBuiltins(draft, mode);

  // ---- header media -------------------------------------------------------------

  async function upload(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError("That file is over 4 MB. Put it online and paste its link instead.");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/templates/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      update({ header: { type: draft.header.type as MediaFormat, handle: data.handle } });
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
      update({ header: { type: draft.header.type as MediaFormat, handle } });
      setMediaPreview(draft.header.type === "IMAGE" ? mediaLink.trim() : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  function setTemplateType(type: DraftHeader["type"]) {
    setMediaPreview(null);
    const header: DraftHeader =
      type === "NONE" ? { type: "NONE" } : type === "TEXT" ? { type: "TEXT", text: "", example: "" } : { type };
    update({ header });
  }

  // ---- interactive actions ----------------------------------------------------------

  const ctas = draft.buttons.filter(isCta);
  const quick = draft.buttons.filter((b) => !isCta(b));
  const currentMode: ActionMode = actionMode ?? (ctas.length && quick.length ? "ALL" : ctas.length ? "CTA" : quick.length ? "QUICK" : "NONE");
  // Call-to-action buttons first, then quick replies (WhatsApp wants the two groups kept together).
  const setButtons = (nextCtas: DraftButton[], nextQuick: DraftButton[]) => update({ buttons: [...nextCtas, ...nextQuick] });
  function chooseActionMode(m: ActionMode) {
    setActionMode(m);
    if (m === "NONE") setButtons([], []);
    if (m === "CTA") setButtons(ctas, []);
    if (m === "QUICK") setButtons([], quick);
  }
  const count = (t: DraftButton["type"]) => draft.buttons.filter((b) => b.type === t).length;
  const roomLeft = LIMITS.buttons - draft.buttons.length;
  const left = {
    QUICK_REPLY: Math.min(LIMITS.quickReplies - count("QUICK_REPLY"), roomLeft),
    URL: Math.min(LIMITS.urlButtons - count("URL"), roomLeft),
    PHONE_NUMBER: Math.min(LIMITS.phoneButtons - count("PHONE_NUMBER"), roomLeft),
    COPY_CODE: Math.min(LIMITS.copyCodeButtons - count("COPY_CODE"), roomLeft),
  };

  // ---- save -------------------------------------------------------------------------

  async function saveDraft() {
    setSaving("draft");
    setError(null);
    try {
      if (draftId) await api.request("PUT", `/api/templates/drafts/${draftId}`, draft);
      else setDraftId((await api.post<{ id: string }>("/api/templates/drafts", draft)).id);
      setNotice("Draft saved. Find it under Templates → Draft.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the draft");
    } finally {
      setSaving(null);
    }
  }

  async function submit() {
    setSaving("submit");
    setError(null);
    try {
      if (mode === "create") {
        await api.post(`/api/templates${draftId ? `?draftId=${draftId}` : ""}`, draft);
        router.push(`/templates?submitted=${encodeURIComponent(draft.name)}`);
      } else {
        await api.patch(`/api/templates/${id}`, draft);
        router.push(`/templates?updated=${encodeURIComponent(draft.name)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
      setSaving(null);
    }
  }

  // ---- render -------------------------------------------------------------------------

  const h = draft.header;
  const bodyVars = placeholders(draft.body.text);
  const ttlRange = TTL_RANGES[draft.category];
  const ttlUnit = [...TTL_UNITS].reverse().find((u) => draft.ttl.seconds % u.seconds === 0 && draft.ttl.seconds >= u.seconds) ?? TTL_UNITS[0];
  const title = mode === "create" ? "New Template Message" : draft.name || "Template";

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Link href="/templates" className="rounded p-1 text-slate-600 hover:bg-slate-100" aria-label="Back to templates">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="truncate text-lg font-medium">{title}</h1>
        {existing && <TemplateStatusBadge status={existing.status} />}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-7xl p-4 md:p-6">
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          <ErrorNote>{loadError}</ErrorNote>

          {existing?.rejectedReason && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <b>Rejected:</b> {REJECTION_REASON[existing.rejectedReason] ?? existing.rejectedReason}. Fix it below and resubmit.
            </div>
          )}
          {readOnly && existing && (
            <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              This template is {existing.status === "PENDING" ? "in review" : existing.status.toLowerCase().replace(/_/g, " ")}, so it can&apos;t be edited right now. WhatsApp only allows editing approved, rejected or paused templates.
            </div>
          )}
          {mode === "edit" && existing?.status === "APPROVED" && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Approved templates can be edited <b>once a day and 10 times a month</b>. After saving, WhatsApp reviews the template again.
            </div>
          )}

          {!loading && (
            <fieldset disabled={readOnly} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-7 rounded-lg border border-slate-200 bg-white p-5 md:p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Section title="Template Category" help="Your template should fall under one of these categories.">
                    <select
                      className="input"
                      value={draft.category}
                      disabled={mode === "edit" && (draft.category === "AUTHENTICATION" || existing?.draft.category === "AUTHENTICATION")}
                      onChange={(e) => {
                        const category = e.target.value as DraftCategory;
                        const r = TTL_RANGES[category];
                        update({ category, ttl: { ...draft.ttl, seconds: Math.min(Math.max(draft.ttl.seconds, r.min), r.max) } });
                      }}
                    >
                      {CATEGORIES.filter((c) => mode === "create" || (c.value === "AUTHENTICATION") === (draft.category === "AUTHENTICATION")).map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">{CATEGORIES.find((c) => c.value === draft.category)?.help}</p>
                  </Section>
                  <Section title="Template Language" help="The language your message is written in.">
                    <select className="input" value={draft.language} disabled={mode === "edit"} onChange={(e) => update({ language: e.target.value })}>
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label} ({l.code})
                        </option>
                      ))}
                    </select>
                  </Section>
                </div>

                <Section
                  title={
                    <span className="flex items-center justify-between gap-3">
                      Time-To-Live (TTL)
                      <Toggle checked={draft.ttl.enabled} disabled={mode === "edit"} onChange={(enabled) => update({ ttl: { ...draft.ttl, enabled } })} label="Custom time-to-live" />
                    </span>
                  }
                  help={`How long WhatsApp keeps trying to deliver if the person is offline, so they don't get outdated messages. Default for ${draft.category.toLowerCase()}: ${ttlRange.default}.${mode === "edit" ? " Can only be set when creating a template." : ""}`}
                >
                  {draft.ttl.enabled && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className="input w-28"
                        inputMode="numeric"
                        value={draft.ttl.seconds / ttlUnit.seconds}
                        onChange={(e) => update({ ttl: { enabled: true, seconds: Math.round((Number(e.target.value) || 0) * ttlUnit.seconds) } })}
                        aria-label="Time-to-live value"
                      />
                      <select
                        className="input w-32"
                        value={ttlUnit.seconds}
                        onChange={(e) => update({ ttl: { enabled: true, seconds: Math.round((draft.ttl.seconds / ttlUnit.seconds) * Number(e.target.value)) } })}
                        aria-label="Time-to-live unit"
                      >
                        {TTL_UNITS.map((u) => (
                          <option key={u.label} value={u.seconds}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-500">
                        Allowed: {formatDuration(ttlRange.min)} to {formatDuration(ttlRange.max)}
                      </span>
                    </div>
                  )}
                </Section>

                <Section title="Template Name" help="Lowercase letters, numbers and underscores only. No spaces or special characters. e.g. app_verification_code">
                  <input
                    className="input"
                    value={draft.name}
                    disabled={mode === "edit"}
                    placeholder="Enter name"
                    onChange={(e) => update({ name: typingName(e.target.value) })}
                    onBlur={() => update({ name: toTemplateName(draft.name) })}
                  />
                </Section>

                {isAuth ? (
                  <AuthFields draft={draft} setAuth={setAuth} />
                ) : (
                  <>
                    <Section title="Template Type" help="Text only, or text with an image, video or document on top.">
                      <select className="input" value={h.type === "TEXT" ? "NONE" : h.type} onChange={(e) => setTemplateType(e.target.value as DraftHeader["type"])}>
                        {TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Section>

                    {(h.type === "NONE" || h.type === "TEXT") && (
                      <Section title={<>Template Header <Optional /></>} help={`A bold title above your message. Up to ${LIMITS.headerText} characters, one variable allowed.`}>
                        <Counter value={h.type === "TEXT" ? h.text : ""} max={LIMITS.headerText}>
                          <input
                            className="input"
                            value={h.type === "TEXT" ? h.text : ""}
                            placeholder="e.g. Your order is on its way"
                            onChange={(e) =>
                              update({ header: e.target.value ? { type: "TEXT", text: e.target.value, example: h.type === "TEXT" ? h.example : "" } : { type: "NONE" } })
                            }
                          />
                        </Counter>
                        {h.type === "TEXT" && placeholders(h.text).length > 0 && (
                          <SampleRow label={`{{${placeholders(h.text)[0]}}}`} value={h.example} onChange={(example) => update({ header: { ...h, example } })} />
                        )}
                      </Section>
                    )}

                    {h.type !== "NONE" && h.type !== "TEXT" && (
                      <Section title={`Template Media (${h.type.toLowerCase()})`} help={`WhatsApp needs a sample ${h.type.toLowerCase()} for review. You choose the real file when you send a campaign.`}>
                        <input type="file" accept={ACCEPT[h.type]} onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} className="text-sm" />
                        <div className="mt-2 flex gap-2">
                          <input className="input" value={mediaLink} onChange={(e) => setMediaLink(e.target.value)} placeholder="…or paste a public https:// link (for files over 4 MB)" />
                          <button type="button" className="btn shrink-0" onClick={uploadLink} disabled={uploading || !mediaLink.trim()}>
                            Use link
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs">
                          {uploading ? "Uploading to WhatsApp…" : h.handle ? "✓ Sample uploaded" : h.sampleUrl ? "Current sample kept (re-uploaded on save)" : <span className="text-slate-500">No sample yet</span>}
                        </p>
                      </Section>
                    )}

                    <Section
                      title="Template Format"
                      help={`Use text formatting: *bold*, _italic_ & ~strikethrough~. Up to ${LIMITS.body} characters. e.g. Hello {{1}}, your code will expire in {{2}} mins.`}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <ToolButton label="Bold" onClick={() => insert("", "*")} icon={<Bold size={15} />} />
                        <ToolButton label="Italic" onClick={() => insert("", "_")} icon={<Italic size={15} />} />
                        <ToolButton label="Strikethrough" onClick={() => insert("", "~")} icon={<Strikethrough size={15} />} />
                        <span className="mx-1 h-5 w-px bg-slate-200" />
                        {mode === "create" && (
                          <select
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            value={draft.parameterFormat}
                            onChange={(e) => update({ parameterFormat: e.target.value as TemplateDraft["parameterFormat"], body: { ...draft.body, examples: {} } })}
                            aria-label="Variable style"
                          >
                            <option value="POSITIONAL">Variables: {"{{1}}"}</option>
                            <option value="NAMED">Variables: {"{{name}}"}</option>
                          </select>
                        )}
                        {draft.parameterFormat === "NAMED" && (
                          <input
                            className="input w-36 py-1"
                            value={varName}
                            onChange={(e) => setVarName(e.target.value)}
                            placeholder="variable name"
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addVariable())}
                          />
                        )}
                        <button type="button" className="btn" onClick={addVariable} disabled={draft.parameterFormat === "NAMED" && !varName.trim()}>
                          <Plus size={14} /> Add variable
                        </button>
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Built-in variables">
                        <span className="text-xs text-slate-500">Built-in:</span>
                        {BUILTIN_VARIABLES.map((v) => (
                          <button
                            key={v.name}
                            type="button"
                            className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-800 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!builtinsAllowed}
                            title={builtinsAllowed ? `Insert {{${v.name}}}, filled with each contact's ${v.label.toLowerCase()}` : undefined}
                            onClick={() => addBuiltin(v.name)}
                          >
                            {v.label}
                          </button>
                        ))}
                        {!builtinsAllowed && (
                          <span className="text-[11px] text-slate-500">
                            {mode === "create" ? "Switch to {{name}} variables to use these." : "This template uses {{1}}-style variables."}
                          </span>
                        )}
                      </div>
                      <Counter value={draft.body.text} max={LIMITS.body}>
                        <textarea
                          ref={bodyRef}
                          className="input min-h-36 bg-slate-50 font-[inherit]"
                          value={draft.body.text}
                          placeholder="Enter your message in here..."
                          onChange={(e) => {
                            setBody(e.target.value);
                            caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
                          }}
                          onSelect={() => {
                            const el = bodyRef.current;
                            if (el) caret.current = { start: el.selectionStart, end: el.selectionEnd };
                          }}
                        />
                      </Counter>
                      {bodyVars.length > 0 && (
                        <div className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
                          <p className="text-xs font-medium text-slate-600">Sample values (WhatsApp reviewers see these; customers don&apos;t)</p>
                          {bodyVars.some((v) => draft.parameterFormat === "NAMED" && builtinVariable(v)) && (
                            <p className="text-[11px] text-slate-500">Built-in variables are filled from each contact&apos;s details when you send.</p>
                          )}
                          {bodyVars.map((v) => (
                            <SampleRow
                              key={v}
                              label={`{{${v}}}`}
                              value={draft.body.examples[v] ?? ""}
                              onChange={(value) => update({ body: { ...draft.body, examples: { ...draft.body.examples, [v]: value } } })}
                            />
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section title={<>Template Footer <Optional /></>} help={`A small grey line under your message. Up to ${LIMITS.footer} characters.`}>
                      <Counter value={draft.footer} max={LIMITS.footer}>
                        <input className="input bg-slate-50" value={draft.footer} onChange={(e) => update({ footer: e.target.value })} placeholder='To stop receiving messages from us, reply "STOP".' />
                      </Counter>
                    </Section>

                    <Section
                      title="Interactive Actions"
                      help={`Buttons under your message. Call-to-actions open a website, call you or copy a code; quick replies send a reply. Up to ${LIMITS.buttonText} characters per button.`}
                    >
                      <div className="mb-3 flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Interactive actions">
                        {(
                          [
                            ["NONE", "None"],
                            ["CTA", "Call to Actions"],
                            ["QUICK", "Quick Replies"],
                            ["ALL", "All"],
                          ] as [ActionMode, string][]
                        ).map(([m, label]) => (
                          <label key={m} className="flex items-center gap-1.5">
                            <input type="radio" name="actions" checked={currentMode === m} onChange={() => chooseActionMode(m)} />
                            {label}
                          </label>
                        ))}
                      </div>

                      <div className="space-y-2">
                        {ctas.map((b, i) => (
                          <CtaRow key={`c${i}`} n={i + 1} button={b} onChange={(next) => setButtons(ctas.map((x, j) => (j === i ? next : x)), quick)} onRemove={() => setButtons(ctas.filter((_, j) => j !== i), quick)} />
                        ))}
                        {quick.map((b, i) => (
                          <div key={`q${i}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-start gap-2">
                            <span className="pt-2 text-sm text-slate-600">Quick Reply {ctas.length + i + 1}:</span>
                            <Counter value={b.type === "QUICK_REPLY" ? b.text : ""} max={LIMITS.buttonText} inline>
                              <input
                                className="input bg-slate-50"
                                value={b.type === "QUICK_REPLY" ? b.text : ""}
                                placeholder="Button text"
                                onChange={(e) => setButtons(ctas, quick.map((x, j) => (j === i ? { type: "QUICK_REPLY", text: e.target.value } : x)))}
                              />
                            </Counter>
                            <RemoveButton onClick={() => setButtons(ctas, quick.filter((_, j) => j !== i))} />
                          </div>
                        ))}
                      </div>

                      {currentMode !== "NONE" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(currentMode === "QUICK" || currentMode === "ALL") && (
                            <AddButton label="Quick Replies" left={left.QUICK_REPLY} onClick={() => setButtons(ctas, [...quick, { type: "QUICK_REPLY", text: "" }])} />
                          )}
                          {(currentMode === "CTA" || currentMode === "ALL") && (
                            <>
                              <AddButton label="URL" left={left.URL} onClick={() => setButtons([...ctas, { type: "URL", text: "", url: "https://", example: "" }], quick)} />
                              <AddButton label="Phone Number" left={left.PHONE_NUMBER} onClick={() => setButtons([...ctas, { type: "PHONE_NUMBER", text: "Call us", phone: "" }], quick)} />
                              <AddButton label="Copy Code" left={left.COPY_CODE} onClick={() => setButtons([...ctas, { type: "COPY_CODE", example: "" }], quick)} />
                            </>
                          )}
                          {draft.category === "MARKETING" && !quick.some((b) => b.type === "QUICK_REPLY" && /stop/i.test(b.text)) && left.QUICK_REPLY > 0 && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => {
                                setActionMode(ctas.length ? "ALL" : "QUICK");
                                setButtons(ctas, [...quick, { type: "QUICK_REPLY", text: "Stop promotions" }]);
                              }}
                            >
                              + &ldquo;Stop promotions&rdquo;
                            </button>
                          )}
                        </div>
                      )}
                    </Section>
                  </>
                )}
              </div>

              <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="font-medium">Template Preview</h2>
                  <p className="mb-3 text-xs text-slate-500">Your template message preview. It updates as you fill in the form.</p>
                  <TemplatePreview draft={draft} mediaUrl={mediaPreview} />
                  <p className="mt-3 text-[11px] text-slate-400">
                    Disclaimer: this is a graphical representation of the message. The delivered message uses the media you send and may look slightly different.
                  </p>
                </div>

                {!readOnly && (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    {problems.length > 0 ? (
                      <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                        {problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-emerald-800">✓ Ready to submit. WhatsApp reviews it, usually within minutes, sometimes up to 24 hours.</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      {mode === "create" && (
                        <button type="button" className="btn flex-1" disabled={saving !== null} onClick={saveDraft}>
                          {saving === "draft" ? "Saving…" : "Save as draft"}
                        </button>
                      )}
                      <button type="button" className="btn-primary flex-1" disabled={problems.length > 0 || saving !== null || uploading} onClick={submit}>
                        {saving === "submit" ? "Submitting…" : mode === "create" ? "Submit" : "Save & resubmit"}
                      </button>
                    </div>
                    {notice && <p className="mt-2 text-xs text-emerald-800">{notice}</p>}
                    <div className="mt-2">
                      <ErrorNote>{error}</ErrorNote>
                    </div>
                  </div>
                )}
              </aside>
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Authentication (OTP) fields
// ---------------------------------------------------------------------------

const OTP_TYPES: { value: OtpType; label: string; help: string }[] = [
  { value: "COPY_CODE", label: "Copy code", help: "A button copies the code; they paste it into your app or website." },
  { value: "ONE_TAP", label: "One-tap autofill", help: "Android: a button fills the code into your app. Falls back to copy code." },
  { value: "ZERO_TAP", label: "Zero-tap", help: "Android: your app receives the code automatically, no tap needed." },
];

function AuthFields({ draft, setAuth }: { draft: TemplateDraft; setAuth: (c: Partial<TemplateDraft["auth"]>) => void }) {
  const a = draft.auth;
  return (
    <>
      <Section title="Code Delivery Setup" help="How the customer gets the one-time code into your app. WhatsApp writes the message text for you.">
        <div className="space-y-2">
          {OTP_TYPES.map((t) => (
            <label key={t.value} className="flex items-start gap-2 text-sm">
              <input type="radio" className="mt-1" name="otp" checked={a.otpType === t.value} onChange={() => setAuth({ otpType: t.value })} />
              <span>
                <span className="font-medium">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.help}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Message Content" help="The text is fixed by WhatsApp: “123456 is your verification code.” You can add:">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={a.securityRecommendation} onChange={(e) => setAuth({ securityRecommendation: e.target.checked })} />
          Add security recommendation (&ldquo;For your security, do not share this code.&rdquo;)
        </label>
        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <input type="checkbox" checked={a.codeExpirationMinutes !== null} onChange={(e) => setAuth({ codeExpirationMinutes: e.target.checked ? 10 : null })} />
          Add expiry time for the code
          {a.codeExpirationMinutes !== null && (
            <>
              <input
                className="input w-20 py-1"
                inputMode="numeric"
                value={a.codeExpirationMinutes}
                onChange={(e) => setAuth({ codeExpirationMinutes: Number.parseInt(e.target.value, 10) || 0 })}
                aria-label="Code expiry in minutes"
              />
              minutes <span className="text-xs text-slate-500">(1–90)</span>
            </>
          )}
        </label>
      </Section>

      <Section title={a.otpType === "COPY_CODE" ? "Copy Code Button Text" : "Autofill Button Text"} help={`Up to ${LIMITS.buttonText} characters. Leave empty for WhatsApp's default.`}>
        <Counter value={a.otpType === "COPY_CODE" ? a.buttonText : a.autofillText} max={LIMITS.buttonText}>
          <input
            className="input"
            value={a.otpType === "COPY_CODE" ? a.buttonText : a.autofillText}
            onChange={(e) => setAuth(a.otpType === "COPY_CODE" ? { buttonText: e.target.value } : { autofillText: e.target.value })}
            placeholder={a.otpType === "COPY_CODE" ? "Copy code" : "Autofill"}
          />
        </Counter>
      </Section>

      {a.otpType !== "COPY_CODE" && (
        <Section title="Android App" help="The app that receives the code. Find the signature hash with WhatsApp's guide (11 characters).">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" value={a.packageName} onChange={(e) => setAuth({ packageName: e.target.value })} placeholder="Package name, e.g. com.example.app" />
            <input className="input" value={a.signatureHash} onChange={(e) => setAuth({ signatureHash: e.target.value })} placeholder="App signature hash" />
          </div>
          {a.otpType === "ZERO_TAP" && (
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={a.zeroTapTermsAccepted} onChange={(e) => setAuth({ zeroTapTermsAccepted: e.target.checked })} />
              I accept WhatsApp&apos;s zero-tap terms: I won&apos;t use zero-tap for anything other than delivering this code.
            </label>
          )}
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** While typing a name: lowercase, spaces/symbols → "_" (edges are tidied on blur). */
function typingName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").slice(0, LIMITS.name);
}

function Section({ title, help, children }: { title: ReactNode; help?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="field-title text-base">{title}</h3>
      {help && <p className="field-help">{help}</p>}
      {children}
    </section>
  );
}

function Optional() {
  return <span className="text-sm font-normal text-slate-400">(Optional)</span>;
}

function SampleRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Sample value, e.g. Asha" />
    </label>
  );
}

function Counter({ value, max, children, inline }: { value: string; max: number; children: ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? "relative" : ""}>
      {children}
      <div className={`text-right text-[11px] tabular-nums ${value.length > max ? "text-red-600" : "text-slate-400"} ${inline ? "absolute right-2 bottom-1" : "mt-0.5"}`}>
        {value.length}/{max}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-[#0f3d3e]" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-4.5" : "left-0.5"}`} />
    </button>
  );
}

function ToolButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button type="button" className="btn px-2" title={label} aria-label={label} onClick={onClick}>
      {icon}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={onClick} aria-label="Remove button">
      <X size={18} />
    </button>
  );
}

function AddButton({ label, left, onClick }: { label: string; left: number; onClick: () => void }) {
  return (
    <button type="button" className="btn" disabled={left <= 0} onClick={onClick}>
      <Plus size={14} /> {label}
      <span className="ml-1 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{Math.max(left, 0)}</span>
    </button>
  );
}

function CtaRow({ n, button: b, onChange, onRemove }: { n: number; button: DraftButton; onChange: (b: DraftButton) => void; onRemove: () => void }) {
  const kind = b.type;
  function changeKind(next: string) {
    if (next === "URL") onChange({ type: "URL", text: "", url: "https://", example: "" });
    if (next === "PHONE_NUMBER") onChange({ type: "PHONE_NUMBER", text: "Call us", phone: "" });
    if (next === "COPY_CODE") onChange({ type: "COPY_CODE", example: "" });
  }
  const dynamic = b.type === "URL" && placeholders(b.url).length > 0;
  return (
    <div className="grid gap-2 md:grid-cols-[7.5rem_9rem_minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-start">
      <span className="pt-2 text-sm text-slate-600">Call to Action {n}:</span>
      <select className="input bg-slate-50" value={kind} onChange={(e) => changeKind(e.target.value)} aria-label={`Call to action ${n} type`}>
        <option value="URL">URL</option>
        <option value="PHONE_NUMBER">Phone Number</option>
        <option value="COPY_CODE">Copy Code</option>
      </select>
      {b.type === "COPY_CODE" ? (
        <input className="input bg-slate-50 md:col-span-2" value={b.example} maxLength={LIMITS.copyCode} onChange={(e) => onChange({ ...b, example: e.target.value })} placeholder="Sample code, e.g. DIWALI20" />
      ) : (
        <>
          <Counter value={b.text} max={LIMITS.buttonText} inline>
            <input className="input bg-slate-50" value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} placeholder="Button title" />
          </Counter>
          {b.type === "URL" ? (
            <div className="space-y-1">
              <input className="input" value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value })} placeholder="https://example.com/page" />
              {dynamic ? (
                <input className="input" value={b.example} onChange={(e) => onChange({ ...b, example: e.target.value })} placeholder="Sample for {{1}} at the end, e.g. diwali" />
              ) : (
                <button type="button" className="text-xs text-slate-500 underline" onClick={() => onChange({ ...b, url: `${b.url.replace(/\/?$/, "/")}{{1}}` })}>
                  + Personal link per customer (adds {"{{1}}"} at the end)
                </button>
              )}
            </div>
          ) : b.type === "PHONE_NUMBER" ? (
            <input className="input" value={b.phone} onChange={(e) => onChange({ ...b, phone: e.target.value })} placeholder="+91 98123 45678" />
          ) : null}
        </>
      )}
      <RemoveButton onClick={onRemove} />
    </div>
  );
}
