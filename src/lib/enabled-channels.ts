import type { ChannelName } from "./types";

/**
 * Channels that are switched on. Safe to import from both server and browser code.
 *
 * The chatbot channel (WEB_BOT) is fully built but turned off until you have a callback URL
 * for your bot. To turn it on: set BOT_INGEST_SECRET and BOT_CALLBACK_URL in .env, add
 * "WEB_BOT" below, and restart. See docs/BOT_INTEGRATION.md.
 */
export const ENABLED_CHANNELS: readonly ChannelName[] = ["WHATSAPP"];

export const CHATBOT_ENABLED = ENABLED_CHANNELS.includes("WEB_BOT");

export function isChannelEnabled(channel: ChannelName): boolean {
  return ENABLED_CHANNELS.includes(channel);
}
