const STATUS: Record<string, { label: string; icon: string; className: string }> = {
  APPROVED: { label: "Approved", icon: "✓", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  PENDING: { label: "In review", icon: "◷", className: "bg-sky-50 text-sky-800 border-sky-200" },
  IN_APPEAL: { label: "In appeal", icon: "◷", className: "bg-sky-50 text-sky-800 border-sky-200" },
  REJECTED: { label: "Rejected", icon: "✕", className: "bg-red-50 text-red-800 border-red-200" },
  PAUSED: { label: "Paused", icon: "‖", className: "bg-amber-50 text-amber-900 border-amber-200" },
  DISABLED: { label: "Disabled", icon: "⊘", className: "bg-slate-100 text-slate-600 border-slate-200" },
  PENDING_DELETION: { label: "Being deleted", icon: "–", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

/** Why WhatsApp rejected a template, in plain words. */
export const REJECTION_REASON: Record<string, string> = {
  ABUSIVE_CONTENT: "Content goes against WhatsApp's policies",
  INCORRECT_CATEGORY: "The category doesn't match the content",
  INVALID_FORMAT: "Formatting problem (e.g. variables side by side, or at the start or end)",
  SCAM: "Flagged as a possible scam",
  TAG_CONTENT_MISMATCH: "The content doesn't match the category",
  PROMOTIONAL: "Promotional content in a non-marketing template",
};

export function TemplateStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.toLowerCase().replace(/_/g, " "), icon: "•", className: "bg-slate-50 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.className}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
