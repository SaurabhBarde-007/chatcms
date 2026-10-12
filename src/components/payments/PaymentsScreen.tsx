"use client";

import { Copy, ExternalLink, Plus, Search, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber } from "@/lib/format";
import type { ContactRowDTO } from "@/lib/marketing/contacts";
import { formatMoney } from "@/lib/payments/money";
import type { PaymentDTO, PaymentSummary } from "@/lib/payments/payments";
import { ErrorNote, Modal, Page, Stat } from "../ui/Page";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

type ListResponse = { payments: PaymentDTO[]; nextCursor: string | null; summary: PaymentSummary };
type SettingsResponse = { status: { razorpay: { configured: boolean; mode: string | null; webhookSecret: boolean } } };

const FILTERS = [
  { value: "", label: "All" },
  { value: "CREATED", label: "Pending" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIALLY_PAID", label: "Partly paid" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Collecting payments from customers with Razorpay links sent on WhatsApp. */
export function PaymentsScreen() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = new URLSearchParams({ ...(status && { status }), ...(search.trim() && { q: search.trim() }) }).toString();
  // Refresh every 15 s so payments made by customers show up on their own.
  const list = useFetch<ListResponse>(`/api/payments?${query}`, 15_000);
  const settings = useFetch<SettingsResponse>("/api/settings");
  const rzp = settings.data?.status.razorpay;
  const s = list.data?.summary;

  async function cancel(p: PaymentDTO) {
    if (!confirm(`Cancel the ${formatMoney(p.amount)} link for ${p.contact.name ?? p.contact.phone}? They won't be able to pay with it.`)) return;
    try {
      await api.post(`/api/payments/${p.id}/cancel`);
      list.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    }
  }

  return (
    <Page
      title="Payments"
      subtitle="Collect payments on WhatsApp with Razorpay links: from a chat, a campaign, or right here."
      actions={
        <button className="btn-primary" onClick={() => setCreating(true)} disabled={rzp && !rzp.configured}>
          <Plus size={16} /> New payment link
        </button>
      }
    >
      {rzp && !rzp.configured && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Razorpay isn&apos;t connected yet. Add <code>RAZORPAY_KEY_ID</code>, <code>RAZORPAY_KEY_SECRET</code> and <code>RAZORPAY_WEBHOOK_SECRET</code>, then follow the steps in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </div>
      )}
      {rzp?.configured && rzp.mode === "test" && (
        <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">Razorpay is in <b>test mode</b>: links work, but no real money is collected.</div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Collected" value={s ? formatMoney(s.collected) : "–"} detail="last 30 days" />
        <Stat label="Pending" value={s ? formatMoney(s.pending) : "–"} detail="unpaid links" />
        <Stat label="Payment requests" value={s ? compactNumber(s.requests) : "–"} />
        <Stat label="Paid" value={s ? compactNumber(s.paidCount) : "–"} />
        <Stat label="Conversion" value={s?.conversion == null ? "–" : `${Math.round(s.conversion * 100)}%`} detail="paid ÷ requests" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" type="search" placeholder="Search name, phone, description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {FILTERS.map((f) => (
          <button key={f.label} className={`chip ${status === f.value ? "chip-active" : ""}`} onClick={() => setStatus(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <ErrorNote>{error ?? list.error}</ErrorNote>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">For</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Sent via</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.contact.name ?? p.contact.phone}</div>
                  {p.contact.name && <div className="text-xs text-slate-500">{p.contact.phone}</div>}
                </td>
                <td className="max-w-xs px-4 py-3 text-slate-700">{p.description}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatMoney(p.amount, p.currency)}
                  {p.amountPaid > 0 && p.amountPaid !== p.amount && <div className="text-xs text-emerald-700">{formatMoney(p.amountPaid, p.currency)} paid</div>}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={p.status} />
                  {p.paidAt && <div className="mt-1 text-xs text-slate-500">{new Date(p.paidAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>}
                  {p.paymentMethod && <div className="text-xs text-slate-400">{p.paymentMethod}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {p.campaign ? (
                    <Link href={`/campaigns/${p.campaign.id}`} className="hover:underline">
                      Campaign: {p.campaign.name}
                    </Link>
                  ) : p.sentVia === "chat" ? (
                    "Chat"
                  ) : (
                    "Link only"
                  )}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{new Date(p.createdAt).toLocaleDateString([], { dateStyle: "medium" })}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {p.shortUrl && (
                      <>
                        <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="Copy link" aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(p.shortUrl!)}>
                          <Copy size={16} />
                        </button>
                        <a className="rounded p-1.5 text-slate-500 hover:bg-slate-100" href={p.shortUrl} target="_blank" rel="noreferrer" title="Open link" aria-label="Open link">
                          <ExternalLink size={16} />
                        </a>
                      </>
                    )}
                    {p.status === "CREATED" && (
                      <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-700" title="Cancel link" aria-label="Cancel link" onClick={() => cancel(p)}>
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {list.data && list.data.payments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No payment requests yet. Send one from a chat (₹ button), a campaign (a &ldquo;Payment link&rdquo; value), or New payment link.
                </td>
              </tr>
            )}
            {!list.data && !list.error && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <NewPaymentDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            list.reload();
          }}
        />
      )}
    </Page>
  );
}

function NewPaymentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [q, setQ] = useState("");
  const contacts = useFetch<{ contacts: ContactRowDTO[] }>(q.trim().length >= 2 ? `/api/contacts?q=${encodeURIComponent(q.trim())}` : null);
  const [contact, setContact] = useState<ContactRowDTO | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState(72);
  const [sendInChat, setSendInChat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PaymentDTO | null>(null);

  async function create() {
    if (!contact) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<PaymentDTO>("/api/payments", { contactId: contact.id, amount, description, expiresInHours: hours, sendInChat });
      setCreated(p);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New payment link" onClose={onClose}>
      {created ? (
        <div className="space-y-3 text-sm">
          <p>
            {sendInChat ? "Sent on WhatsApp to " : "Created for "}
            <b>{created.contact.name ?? created.contact.phone}</b>: {formatMoney(created.amount)}.
          </p>
          <div className="flex gap-2">
            <input className="input" readOnly value={created.shortUrl ?? ""} />
            <button className="btn shrink-0" onClick={() => navigator.clipboard?.writeText(created.shortUrl ?? "")}>
              <Copy size={14} /> Copy
            </button>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="field-title">Customer</span>
            {contact ? (
              <div className="mt-1 flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <span>
                  {contact.name ?? "No name"} <span className="text-slate-500">{contact.phone}</span>
                </span>
                <button className="text-xs underline" onClick={() => setContact(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input className="input mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" autoFocus />
                {contacts.data && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200">
                    {contacts.data.contacts.map((c) => (
                      <li key={c.id}>
                        <button className="block w-full px-3 py-1.5 text-left hover:bg-slate-50" onClick={() => setContact(c)}>
                          {c.name ?? "No name"} <span className="text-slate-500">{c.phone}</span>
                        </button>
                      </li>
                    ))}
                    {contacts.data.contacts.length === 0 && <li className="px-3 py-1.5 text-slate-400">No match</li>}
                  </ul>
                )}
              </>
            )}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-title">Amount (₹)</span>
              <input className="input mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1499" />
            </label>
            <label className="block">
              <span className="field-title">Link expires after</span>
              <select className="input mt-1" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                <option value={24}>1 day</option>
                <option value={72}>3 days</option>
                <option value={168}>7 days</option>
                <option value={720}>30 days</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="field-title">What it&apos;s for</span>
            <input className="input mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Course fee – October batch" />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={sendInChat} onChange={(e) => setSendInChat(e.target.checked)} />
            <span>
              Send it in their WhatsApp chat
              <span className="block text-xs text-slate-500">Only possible if they messaged you in the last 24 hours. Otherwise, create the link and share it, or use a campaign.</span>
            </span>
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={!contact || !amount || !description.trim() || busy} onClick={create}>
              {busy ? "Creating…" : sendInChat ? "Create & send" : "Create link"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
