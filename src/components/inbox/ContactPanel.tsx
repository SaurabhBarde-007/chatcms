"use client";

import { useState } from "react";
import { CHANNEL_LABEL, classLabel, contactName, fieldLabel, fullTime } from "@/lib/format";
import type { ConversationDetailDTO } from "@/lib/types";
import { isWindowOpen } from "@/lib/whatsapp-window";
import { BUILTIN_ATTRIBUTES } from "@/lib/marketing/templates";
import { ContactDialog } from "../contacts/ContactDialog";
import { ContactMarketing } from "./ContactMarketing";

/** Right-hand panel: who the customer is. */
export function ContactPanel({ conversation }: { conversation: ConversationDetailDTO }) {
  const { contact } = conversation;
  const [editing, setEditing] = useState(false);
  const school = contact.attributes.school ? String(contact.attributes.school) : null;
  const klass = classLabel(contact.attributes.class);

  return (
    <div className="p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{contactName(contact)}</h2>
        <button className="shrink-0 text-xs text-slate-500 underline hover:text-slate-800" onClick={() => setEditing(true)}>
          Edit details
        </button>
      </div>
      {editing && (
        // Saving updates every open inbox through the live stream.
        <ContactDialog mode="edit" contact={contact} onClose={() => setEditing(false)} />
      )}
      <dl className="mt-3 space-y-1.5 text-slate-600">
        {contact.phone && <Row label="Phone" value={contact.phone} />}
        {contact.email && <Row label="Email" value={contact.email} />}
        {school && <Row label="School" value={school} />}
        {klass && <Row label="Class" value={klass} />}
        {Object.entries(contact.attributes)
          .filter(([key, value]) => !BUILTIN_ATTRIBUTES.includes(key) && value !== null && value !== "")
          .map(([key, value]) => (
            <Row key={key} label={fieldLabel(key)} value={String(value)} />
          ))}
        <Row label="Channel" value={CHANNEL_LABEL[conversation.channel]} />
        <Row label="Channel ID" value={conversation.externalId} />
        {conversation.lastInboundAt && <Row label="Last message" value={fullTime(conversation.lastInboundAt)} />}
        {conversation.channel === "WHATSAPP" && (
          <Row label="24h window" value={isWindowOpen(conversation.lastInboundAt) ? "Open" : "Closed"} />
        )}
      </dl>
      {conversation.channel === "WHATSAPP" && <ContactMarketing key={contact.id} contact={contact} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="truncate text-right" title={value}>
        {value}
      </dd>
    </div>
  );
}
