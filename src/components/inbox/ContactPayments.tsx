"use client";

import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import { formatMoney } from "@/lib/payments/money";
import type { PaymentDTO } from "@/lib/payments/payments";
import { PaymentStatusBadge } from "../payments/PaymentStatusBadge";

/** This customer's recent payment requests (refreshes, so "paid" shows up on its own). */
export function ContactPayments({ contactId }: { contactId: string }) {
  const { data } = useFetch<{ payments: PaymentDTO[] }>(`/api/payments?contactId=${contactId}`, 15_000);
  if (!data?.payments.length) return null;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold text-slate-500">Payments</h3>
      <ul className="mt-1.5 space-y-2">
        {data.payments.slice(0, 5).map((p) => (
          <li key={p.id} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
              <PaymentStatusBadge status={p.status} />
            </div>
            <div className="truncate text-slate-500" title={p.description}>
              {p.description}
            </div>
          </li>
        ))}
      </ul>
      <Link href="/payments" className="mt-2 inline-block text-xs text-slate-500 hover:underline">
        All payments →
      </Link>
    </div>
  );
}
