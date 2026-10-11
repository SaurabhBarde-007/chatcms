import { CHANNEL_LABEL, contactName, fullTime } from "@/lib/format";
import type { ConversationDetailDTO } from "@/lib/types";
import { isWindowOpen } from "@/lib/whatsapp-window";
import { ContactMarketing } from "./ContactMarketing";

/** Right-hand panel: who the customer is. */
export function ContactPanel({ conversation }: { conversation: ConversationDetailDTO }) {
  const { contact } = conversation;

  return (
    <div className="p-4 text-sm">
      <h2 className="text-base font-semibold">{contactName(contact)}</h2>
      <dl className="mt-3 space-y-1.5 text-slate-600">
        {contact.phone && <Row label="Phone" value={contact.phone} />}
        {contact.email && <Row label="Email" value={contact.email} />}
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
