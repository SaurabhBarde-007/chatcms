import type { Channel } from "@/generated/prisma/client";
import type { ChannelAdapter } from "./types";
import { webBotAdapter } from "./webbot";
import { whatsappAdapter } from "./whatsapp";

// Registry: one adapter per channel.
const adapters: Record<Channel, ChannelAdapter> = {
  WEB_BOT: webBotAdapter,
  WHATSAPP: whatsappAdapter,
};

export function getAdapter(channel: Channel): ChannelAdapter {
  return adapters[channel];
}
