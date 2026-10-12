"use client";

import { Info } from "lucide-react";
import { useFetch } from "@/hooks/useFetch";
import { compactNumber } from "@/lib/format";
import type { AccountStatus } from "@/lib/marketing/account";

const QUALITY: Record<string, { label: string; className: string }> = {
  GREEN: { label: "High", className: "bg-emerald-500 text-white" },
  YELLOW: { label: "Medium", className: "bg-amber-400 text-amber-950" },
  RED: { label: "Low", className: "bg-red-500 text-white" },
};

function tierLabel(s: AccountStatus) {
  if (!s.tier) return "–";
  if (s.limit === null) return "Unlimited";
  return `${compactNumber(s.limit)}/24 Hours`;
}

/** WhatsApp number health: quality rating, messaging tier, remaining quota for the next 24h. */
export function AccountBar() {
  const { data } = useFetch<AccountStatus>("/api/account/status");
  const quality = data?.quality ? QUALITY[data.quality] : undefined;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
      <span className="flex items-center gap-1.5">
        Quality Rating
        <Hint text="WhatsApp's rating of your number, based on how people react to your messages (blocks, reports)." />
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${quality?.className ?? "bg-slate-200 text-slate-600"}`}>
          {quality?.label ?? (data?.error ? "Unavailable" : "–")}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        Template Messaging Tier
        <Hint text="How many different people you can start conversations with (template messages) in 24 hours." />
        <b className="font-medium text-slate-900">{data ? tierLabel(data) : "–"}</b>
      </span>
      <span className="flex items-center gap-1.5">
        Remaining Quota
        <Hint text="Your tier minus the people this app messaged with templates in the last 24 hours (an estimate)." />
        <b className="font-medium text-slate-900">{data?.remaining === null || !data ? "–" : compactNumber(data.remaining)}</b>
      </span>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <span title={text} className="cursor-help text-slate-400" aria-label={text}>
      <Info size={14} />
    </span>
  );
}
