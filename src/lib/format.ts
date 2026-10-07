import type { ChannelName, ContactDTO } from "./types";

export const CHANNEL_LABEL: Record<ChannelName, string> = {
  WEB_BOT: "Chatbot",
  WHATSAPP: "WhatsApp",
};

export function contactName(c: ContactDTO): string {
  return c.name || c.phone || c.email || "Unknown visitor";
}

/** "14:05" today, "Mon" this week, otherwise "12 Sep". */
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
