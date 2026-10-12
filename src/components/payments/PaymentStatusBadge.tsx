const STATUS: Record<string, { label: string; className: string }> = {
  CREATED: { label: "Pending", className: "bg-amber-100 text-amber-900" },
  PARTIALLY_PAID: { label: "Partly paid", className: "bg-sky-100 text-sky-800" },
  PAID: { label: "Paid", className: "bg-emerald-500 text-white" },
  EXPIRED: { label: "Expired", className: "bg-slate-200 text-slate-600" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-200 text-slate-600" },
};

export function PaymentStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.toLowerCase(), className: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}>{s.label}</span>;
}
