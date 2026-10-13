import type { ChannelName, ContactDTO } from "./types";

export const CHANNEL_LABEL: Record<ChannelName, string> = {
  WEB_BOT: "Chatbot",
  WHATSAPP: "WhatsApp",
};

export function contactName(c: ContactDTO): string {
  return c.name || c.phone || c.email || "Unknown visitor";
}

/** "14:05" today, "Mon" this week, otherwise "12 Sep". */
/** A contact's class for display: "8" → "Class 8"; "Class 8" / "Grade 5" stay as they are. */
export function classLabel(value: unknown): string | null {
  const v = value === null || value === undefined ? "" : String(value).trim();
  if (!v) return null;
  return /^(class|grade|std|standard)\b/i.test(v) ? v : `Class ${v}`;
}

/** 12.5 → "₹12.50", 300 → "₹300" (e.g. estimated WhatsApp costs). */
export function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}

/** A custom field's name for display: "parent_name" → "Parent name". */
export function fieldLabel(key: string): string {
  const words = key.replace(/_+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function fullTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

/** 1,284 · 12.9K · 4.2M */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat([], { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

/** part/whole as "42%" (or "–" when there's nothing to divide by). */
export function percent(part: number, whole: number): string {
  if (!whole) return "–";
  const p = (part / whole) * 100;
  return `${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;
}

/** 0.4 → "24 sec", 12 → "12 min", 95 → "1.6 h", 3000 → "2.1 days" */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "–";
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

/** "in 3 h", "5 min ago" */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat([], { numeric: "auto" });
  if (abs < 60_000) return diff >= 0 ? "in a moment" : "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}
