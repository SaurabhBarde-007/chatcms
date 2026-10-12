import type { CampaignDTO } from "@/lib/marketing/campaigns";

const STATUS: Record<CampaignDTO["status"], { label: string; className: string }> = {
  SCHEDULED: { label: "Scheduled", className: "bg-sky-100 text-sky-800" },
  SENDING: { label: "Sending", className: "bg-amber-100 text-amber-900" },
  COMPLETED: { label: "Sent", className: "bg-emerald-500 text-white" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-200 text-slate-600" },
  FAILED: { label: "Stopped", className: "bg-red-100 text-red-700" },
  LIVE: { label: "Live", className: "bg-emerald-500 text-white" },
  PAUSED: { label: "Paused", className: "bg-slate-200 text-slate-700" },
};

/** Campaign status as a pill (text label, never color alone). */
export function CampaignStatusBadge({ status }: { status: CampaignDTO["status"] }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}>
      {status === "SENDING" || status === "LIVE" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden /> : null}
      {s.label}
    </span>
  );
}
