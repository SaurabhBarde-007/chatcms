"use client";

import { CheckCircle2, CircleAlert, Copy } from "lucide-react";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/api-client";
import { compactNumber } from "@/lib/format";
import type { AccountStatus } from "@/lib/marketing/account";
import type { PaymentSettings, Pricing } from "@/lib/settings";
import { Card, ErrorNote, Page } from "../ui/Page";

type SettingsResponse = {
  pricing: Pricing;
  payments: PaymentSettings;
  status: { razorpay: { configured: boolean; mode: string | null; webhookSecret: boolean }; apiKey: boolean; cronSecret: boolean };
};
const noSubscribe = () => () => {};

export function SettingsScreen() {
  const settings = useFetch<SettingsResponse>("/api/settings");
  const account = useFetch<AccountStatus>("/api/account/status");
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "https://your-app.example.com");
  const st = settings.data?.status;

  return (
    <Page title="Settings" subtitle="Connections, payment messages and the rates used for cost estimates.">
      <ErrorNote>{settings.error}</ErrorNote>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="WhatsApp">
          <dl className="space-y-1.5 text-sm">
            <Row label="Number" value={account.data?.phone ?? "–"} />
            <Row label="Display name" value={account.data?.name ?? "–"} />
            <Row label="Quality rating" value={account.data?.quality ?? "–"} />
            <Row label="Messaging tier" value={account.data?.tier ? `${account.data.tier}${account.data.limit ? ` (${compactNumber(account.data.limit)} people / 24h)` : ""}` : "–"} />
          </dl>
          {account.data?.error && <p className="mt-2 text-xs text-red-700">Couldn&apos;t reach WhatsApp: {account.data.error}</p>}
          <CopyField label="Webhook URL (Meta App → WhatsApp → Configuration)" value={`${origin}/api/webhooks/whatsapp`} />
        </Card>

        <Card title="Razorpay (payments)">
          {st && (
            <ul className="space-y-1 text-sm">
              <Check ok={st.razorpay.configured} text={st.razorpay.configured ? `Connected (${st.razorpay.mode} mode)` : "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET"} />
              <Check ok={st.razorpay.webhookSecret} text={st.razorpay.webhookSecret ? "Webhook secret set" : "Add RAZORPAY_WEBHOOK_SECRET"} />
            </ul>
          )}
          <CopyField label="Webhook URL (Razorpay Dashboard → Accounts & Settings → Webhooks)" value={`${origin}/api/webhooks/razorpay`} />
          <p className="mt-2 text-xs text-slate-500">
            Events to tick: <code>payment_link.paid</code>, <code>payment_link.partially_paid</code>, <code>payment_link.expired</code>, <code>payment_link.cancelled</code>. Use the same secret as
            RAZORPAY_WEBHOOK_SECRET.
          </p>
        </Card>

        {settings.data && <PaymentMessages initial={settings.data.payments} onSaved={settings.reload} />}
        {settings.data && <Rates initial={settings.data.pricing} onSaved={settings.reload} />}

        <Card title="API & scheduling">
          {st && (
            <ul className="space-y-1 text-sm">
              <Check ok={st.apiKey} text={st.apiKey ? "API key set (opt-in API, API campaigns)" : "Add API_KEY to use the opt-in API and API campaigns"} />
              <Check ok={st.cronSecret} text={st.cronSecret ? "Scheduler secret set" : "Add CRON_SECRET for scheduled campaigns (GitHub Actions)"} />
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Docs: docs/API.md (API campaigns), docs/OPT_IN_API.md (opt-ins). The scheduler runs from .github/workflows/campaign-scheduler.yml.</p>
        </Card>
      </div>
    </Page>
  );
}

function PaymentMessages({ initial, onSaved }: { initial: PaymentSettings; onSaved: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <Card title="Payment messages">
      <SaveForm onSave={() => api.request("PUT", "/api/settings", { payments: v })} onSaved={onSaved}>
        <label className="block text-sm">
          <span className="field-title">Payment request (sent in chats)</span>
          <textarea className="input mt-1 min-h-20" value={v.requestText} onChange={(e) => setV({ ...v, requestText: e.target.value })} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.sendReceipt} onChange={(e) => setV({ ...v, sendReceipt: e.target.checked })} />
          Send a &ldquo;payment received&rdquo; message on WhatsApp (when the 24h window is open)
        </label>
        {v.sendReceipt && (
          <label className="mt-2 block text-sm">
            <span className="field-title">Payment received</span>
            <textarea className="input mt-1 min-h-16" value={v.receiptText} onChange={(e) => setV({ ...v, receiptText: e.target.value })} />
          </label>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm">
          Links expire after
          <input
            className="input w-20 py-1"
            inputMode="numeric"
            value={v.defaultExpiryHours}
            onChange={(e) => setV({ ...v, defaultExpiryHours: Math.max(1, Number(e.target.value) || 1) })}
          />
          hours by default
        </label>
        <p className="mt-2 text-xs text-slate-500">
          You can use {"{name}"}, {"{amount}"}, {"{description}"} and {"{link}"} (the request must include {"{link}"}).
        </p>
      </SaveForm>
    </Card>
  );
}

function Rates({ initial, onSaved }: { initial: Pricing; onSaved: () => void }) {
  const [v, setV] = useState(initial);
  const field = (key: "MARKETING" | "UTILITY" | "AUTHENTICATION", label: string) => (
    <label className="block text-sm">
      <span className="text-xs text-slate-600">{label}</span>
      <input className="input mt-0.5" inputMode="decimal" value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) || 0 })} />
    </label>
  );
  return (
    <Card title="Message rates (for cost estimates)">
      <SaveForm onSave={() => api.request("PUT", "/api/settings", { pricing: v })} onSaved={onSaved}>
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block text-sm">
            <span className="text-xs text-slate-600">Currency</span>
            <input className="input mt-0.5" value={v.currency} maxLength={3} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} />
          </label>
          {field("MARKETING", "Marketing")}
          {field("UTILITY", "Utility")}
          {field("AUTHENTICATION", "Authentication")}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          What WhatsApp charges per <b>delivered</b> message. Defaults are Meta&apos;s India list rates (Oct 2026). Check your rate card in WhatsApp Manager → Billing.
        </p>
      </SaveForm>
    </Card>
  );
}

function SaveForm({ onSave, onSaved, children }: { onSave: () => Promise<unknown>; onSaved: () => void; children: ReactNode }) {
  const [state, setState] = useState<{ busy: boolean; message: string | null; error: string | null }>({ busy: false, message: null, error: null });
  async function save() {
    setState({ busy: true, message: null, error: null });
    try {
      await onSave();
      setState({ busy: false, message: "Saved", error: null });
      onSaved();
    } catch (err) {
      setState({ busy: false, message: null, error: err instanceof Error ? err.message : "Could not save" });
    }
  }
  return (
    <div>
      {children}
      <div className="mt-3 flex items-center gap-2">
        <button className="btn-primary" disabled={state.busy} onClick={save}>
          {state.busy ? "Saving…" : "Save"}
        </button>
        {state.message && <span className="text-xs text-emerald-700">{state.message}</span>}
      </div>
      {state.error && (
        <div className="mt-2">
          <ErrorNote>{state.error}</ErrorNote>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right">{value}</dd>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {ok ? <CheckCircle2 size={16} className="text-emerald-600" aria-label="Done" /> : <CircleAlert size={16} className="text-amber-600" aria-label="To do" />}
      {text}
    </li>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="mt-3 block text-sm">
      <span className="text-xs text-slate-600">{label}</span>
      <span className="mt-0.5 flex gap-2">
        <input className="input" readOnly value={value} />
        <button type="button" className="btn shrink-0" onClick={() => navigator.clipboard?.writeText(value)} aria-label="Copy">
          <Copy size={14} />
        </button>
      </span>
    </label>
  );
}
