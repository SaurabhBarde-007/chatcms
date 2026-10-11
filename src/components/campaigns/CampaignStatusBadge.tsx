import type { CampaignDTO } from "@/lib/marketing/campaigns";

const STATUS: Record<CampaignDTO["status"], { label: string; icon: string; className: string }> = {
  SCHEDULED: { label: "Scheduled", icon: "◷", className: "bg-slate-50 text-slate-700 border-slate-200" },
  SENDING: { label: "Sending", icon: "●", className: "bg-sky-50 text-sky-800 border-sky-200" },
  COMPLETED: { label: "Completed", icon: "✓", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  CANCELLED: { label: "Cancelled", icon: "–", className: "bg-slate-100 text-slate-600 border-slate-200" },
  FAILED: { label: "Stopped", icon: "!", className: "bg-red-50 text-red-800 border-red-200" },
};

export function CampaignStatusBadge({ status }: { status: CampaignDTO["status"] }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${s.className}`}>
      <span aria-hidden className={status === "SENDING" ? "animate-pulse" : ""}>
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}
