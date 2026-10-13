"use client";

import { Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { api } from "@/lib/api-client";
import type { ContactRowDTO } from "@/lib/marketing/contacts";
import { normalizeHeader } from "@/lib/marketing/csv";
import { BUILTIN_ATTRIBUTES } from "@/lib/marketing/templates";
import { ErrorNote, Modal } from "../ui/Page";

export type ContactDetails = {
  name: string | null;
  email: string | null;
  attributes: Record<string, unknown>;
};

type EditableContact = ContactDetails & { id: string; phone: string | null };
type Detail = { id: number; key: string; value: string };

type Props =
  | { mode: "create"; onClose: () => void; onSaved: (contact: ContactRowDTO) => void }
  | { mode: "edit"; contact: EditableContact; onClose: () => void; onSaved?: (details: ContactDetails) => void };

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));
let nextId = 0;

/**
 * Add a contact by hand, or edit one's details: name, email, school, class (the built-in
 * template variables) and any other details, e.g. parent's name or city.
 */
export function ContactDialog(props: Props) {
  const editing = props.mode === "edit" ? props.contact : null;
  const original = editing?.attributes ?? {};
  const originalCustom = Object.keys(original).filter((k) => !BUILTIN_ATTRIBUTES.includes(k));

  const [countryCode, setCountryCode] = useState("91");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState(editing?.name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [school, setSchool] = useState(text(original.school));
  const [klass, setKlass] = useState(text(original.class));
  const [details, setDetails] = useState<Detail[]>(() => originalCustom.map((key) => ({ id: nextId++, key, value: text(original[key]) })));
  const [tags, setTags] = useState("");
  const [optedIn, setOptedIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Other details as they'll be stored: "Parent Name" → parent_name.
  const filled = details.filter((d) => d.key.trim() || d.value.trim()).map((d) => ({ ...d, field: normalizeHeader(d.key) }));
  const problems = [
    props.mode === "create" && !phone.trim() && "Enter a phone number",
    filled.some((d) => !d.field) && "Give each detail a name",
    filled.some((d) => BUILTIN_ATTRIBUTES.includes(d.field)) && "Use the School and Class fields for those",
    new Set(filled.map((d) => d.field)).size < filled.length && "Two details have the same name",
  ].filter(Boolean) as string[];

  async function save() {
    setSaving(true);
    setError(null);
    const custom = Object.fromEntries(filled.filter((d) => d.value.trim()).map((d) => [d.field, d.value.trim()]));
    try {
      if (props.mode === "create") {
        const attributes = { ...custom, ...(school.trim() && { school: school.trim() }), ...(klass.trim() && { class: klass.trim() }) };
        const contact = await api.post<ContactRowDTO>("/api/contacts", {
          phone,
          defaultCountryCode: countryCode.replace(/\D/g, ""),
          name,
          email,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          attributes,
          optedIn,
        });
        props.onSaved(contact);
      } else {
        // Details you removed (or renamed) are cleared.
        const removed = originalCustom.filter((k) => !(k in custom));
        const attributes = {
          ...Object.fromEntries(removed.map((k) => [k, null])),
          ...custom,
          school: school.trim() || null,
          class: klass.trim() || null,
        };
        await api.patch(`/api/contacts/${props.contact.id}`, { name: name.trim() || null, email: email.trim() || null, attributes });
        const merged: Record<string, unknown> = { ...original };
        for (const [key, value] of Object.entries(attributes)) {
          if (value) merged[key] = value;
          else delete merged[key];
        }
        props.onSaved?.({ name: name.trim() || null, email: email.trim() || null, attributes: merged });
      }
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Contact details" : "Add contact"} onClose={props.onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!problems.length) save();
        }}
      >
        {editing ? (
          <p className="text-sm text-slate-600">
            <span className="text-slate-400">Phone</span> {editing.phone ?? "—"}
          </p>
        ) : (
          <Field label="WhatsApp number" variable="phone_number">
            <div className="flex gap-2">
              <span className="relative w-20 shrink-0">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">+</span>
                <input
                  className="input pl-5"
                  inputMode="numeric"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  aria-label="Country code"
                />
              </span>
              <input
                className="input"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98123 45678"
                aria-label="Phone number"
                autoFocus
              />
            </div>
            <span className="mt-1 block text-[11px] text-slate-500">A number starting with + keeps its own country code.</span>
          </Field>
        )}

        <Field label="Name" variable="first_name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Asha Sharma" />
        </Field>
        <Field label="Email" variable="email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="asha@example.com" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Field label="School" variable="school">
            <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Delhi Public School" />
          </Field>
          <Field label="Class" variable="class">
            <input className="input" value={klass} onChange={(e) => setKlass(e.target.value)} placeholder="8" />
          </Field>
        </div>

        <div>
          <span className="text-xs font-medium text-slate-600">Other details</span>
          <span className="block text-[11px] text-slate-500">e.g. parent&apos;s name, city, batch. Usable in campaign messages as &ldquo;Custom: …&rdquo;.</span>
          <div className="mt-1.5 space-y-1.5">
            {details.map((d) => (
              <div key={d.id} className="flex gap-1.5">
                <input
                  className="input w-2/5"
                  value={d.key}
                  onChange={(e) => setDetails(details.map((x) => (x.id === d.id ? { ...x, key: e.target.value } : x)))}
                  placeholder="parent_name"
                  aria-label="Detail name"
                />
                <input
                  className="input"
                  value={d.value}
                  onChange={(e) => setDetails(details.map((x) => (x.id === d.id ? { ...x, value: e.target.value } : x)))}
                  placeholder="Ravi Sharma"
                  aria-label="Detail value"
                />
                <button
                  type="button"
                  className="shrink-0 px-1 text-slate-400 hover:text-slate-700"
                  onClick={() => setDetails(details.filter((x) => x.id !== d.id))}
                  aria-label="Remove detail"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
              onClick={() => setDetails([...details, { id: nextId++, key: "", value: "" }])}
            >
              <Plus size={13} /> Add detail
            </button>
          </div>
        </div>

        {!editing && (
          <>
            <Field label="Tags">
              <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="class-8, new-admission" />
            </Field>
            <label className="flex items-start gap-2 rounded-md bg-slate-50 p-2.5 text-sm">
              <input type="checkbox" className="mt-0.5" checked={optedIn} onChange={(e) => setOptedIn(e.target.checked)} />
              <span>
                They agreed to receive WhatsApp messages from us
                <span className="block text-[11px] text-slate-500">Broadcasts only go to opted-in contacts. Only tick this if they said yes.</span>
              </span>
            </label>
          </>
        )}

        {problems.length > 0 && filled.length + Number(!!phone.trim()) > 0 && <p className="text-xs text-amber-800">{problems[0]}</p>}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saving || problems.length > 0}>
            {saving ? "Saving…" : editing ? "Save" : "Add contact"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, variable, children }: { label: string; variable?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs font-medium text-slate-600">
        {label}
        {variable && <code className="text-[11px] font-normal text-teal-700">{`{{${variable}}}`}</code>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
