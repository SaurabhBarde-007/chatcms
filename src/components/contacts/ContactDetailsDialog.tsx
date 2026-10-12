"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { ErrorNote, Modal } from "../ui/Page";

export type ContactDetails = {
  name: string | null;
  email: string | null;
  attributes: Record<string, unknown>;
};

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** Edit the details used by built-in template variables: name, email, school, class. */
export function ContactDetailsDialog({
  contactId,
  contact,
  onClose,
  onSaved,
}: {
  contactId: string;
  contact: ContactDetails;
  onClose: () => void;
  onSaved?: (details: ContactDetails) => void;
}) {
  const [name, setName] = useState(contact.name ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [school, setSchool] = useState(text(contact.attributes.school));
  const [klass, setKlass] = useState(text(contact.attributes.class));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const attributes = { school: school.trim() || null, class: klass.trim() || null };
    try {
      await api.patch(`/api/contacts/${contactId}`, { name: name.trim() || null, email: email.trim() || null, attributes });
      const merged = { ...contact.attributes };
      for (const [key, value] of Object.entries(attributes)) {
        if (value) merged[key] = value;
        else delete merged[key];
      }
      onSaved?.({ name: name.trim() || null, email: email.trim() || null, attributes: merged });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  const field = (label: string, variable: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs font-medium text-slate-600">
        {label}
        <code className="text-[11px] font-normal text-teal-700">{`{{${variable}}}`}</code>
      </span>
      <input className="input mt-1" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
    </label>
  );

  return (
    <Modal title="Contact details" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {field("Name", "first_name", name, setName, "Asha Sharma")}
        {field("Email", "email", email, setEmail, "asha@example.com")}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          {field("School", "school", school, setSchool, "Delhi Public School")}
          {field("Class", "class", klass, setKlass, "8")}
        </div>
        <p className="text-xs text-slate-500">These fill the built-in template variables. The first word of the name is used as {"{{first_name}}"}.</p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
