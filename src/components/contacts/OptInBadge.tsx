import type { OptInStatusName } from "@/lib/types";

const STYLE: Record<OptInStatusName, { label: string; className: string; icon: string }> = {
  OPTED_IN: { label: "Opted in", className: "bg-emerald-50 text-emerald-800 border-emerald-200", icon: "✓" },
  OPTED_OUT: { label: "Opted out", className: "bg-red-50 text-red-800 border-red-200", icon: "✕" },
  UNKNOWN: { label: "Not asked", className: "bg-slate-50 text-slate-600 border-slate-200", icon: "?" },
};

/** Marketing consent (icon + label, never color alone). */
export function OptInBadge({ status }: { status: OptInStatusName }) {
  const s = STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${s.className}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
