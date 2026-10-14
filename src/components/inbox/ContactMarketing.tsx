"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { consentSourceLabel } from "@/lib/format";
import type { ContactDTO, OptInStatusName } from "@/lib/types";
import { OptInBadge } from "../contacts/OptInBadge";

/** Marketing consent, tags and blocking for the contact you're chatting with. */
export function ContactMarketing({ contact }: { contact: ContactDTO }) {
  // A change made here shows at once; otherwise the contact's live state (STOP replies, blocks…).
  const [manual, setManual] = useState<OptInStatusName | null>(null);
  const status = manual ?? contact.optInStatus;
  const reason = consentSourceLabel(manual ? "manual" : contact.optInSource, status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The new state arrives through the live stream (contact.blocked).
  async function toggleBlock() {
    if (!contact.blocked && !confirm("Block this contact? They won't get any messages from you (campaigns, auto-replies or replies) until you unblock them.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/contacts/${contact.id}`, { blocked: !contact.blocked });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function change(next: "OPTED_IN" | "OPTED_OUT") {
    if (next === "OPTED_IN" && !confirm("Only opt them in if they agreed to receive WhatsApp marketing messages from you. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/contacts/${contact.id}`, { optInStatus: next });
      setManual(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold text-slate-500">Marketing</h3>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <OptInBadge status={status} />
        <button
          className="text-xs text-slate-500 underline hover:text-slate-800"
          disabled={busy}
          onClick={() => change(status === "OPTED_IN" ? "OPTED_OUT" : "OPTED_IN")}
        >
          {status === "OPTED_IN" ? "Opt out" : "Opt in"}
        </button>
      </div>
      {reason && <p className="mt-1 text-[11px] text-slate-400">{reason}</p>}
      {contact.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {contact.tags.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        {contact.blocked ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Blocked</span> : <span />}
        <button className="text-xs text-slate-500 underline hover:text-slate-800" disabled={busy} onClick={toggleBlock}>
          {contact.blocked ? "Unblock" : "Block contact"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <Link href="/contacts" className="mt-2 inline-block text-xs text-slate-500 hover:underline">
        Manage contacts →
      </Link>
    </div>
  );
}
