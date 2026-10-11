import { env } from "../env";
import { parseTemplate, type RawTemplate, type Template } from "../marketing/templates";
import type { ChannelAdapter, InboundMessage } from "./types";

// WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api

// ---------------------------------------------------------------------------
// Graph API helper
// ---------------------------------------------------------------------------

/** An error response from the Graph API, with Meta's error code (see classifySendError). */
export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

export async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.whatsapp.graphBaseUrl}/${env.whatsapp.graphVersion}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    const details = e?.error_data?.details;
    // Meta prefixes messages with "(#131026) "; the code is kept separately. Template errors
    // come with a friendlier explanation in error_user_msg, so prefer that.
    const raw = e?.error_user_msg || e?.message;
    const text = typeof raw === "string" ? raw.replace(/^\(#\d+\)\s*/, "") : null;
    const message = text ? (details && !text.includes(details) ? `${text}: ${details}` : text) : null;
    throw new WhatsAppApiError(message ?? `WhatsApp API error ${res.status}`, e?.code, res.status);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type SendResponse = { contacts?: { wa_id?: string }[]; messages?: { id: string }[] };

/** Send an approved template with ready-made components (see lib/marketing/templates.ts). */
export async function sendTemplateMessage(
  to: string,
  template: { name: string; language: string },
  components: Record<string, unknown>[],
): Promise<{ externalId?: string }> {
  const res = await graph<SendResponse>(`${env.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: { name: template.name, language: { code: template.language }, components },
    }),
  });
  return { externalId: res.messages?.[0]?.id };
}

export const whatsappAdapter: ChannelAdapter = {
  async send(conversation, message) {
    const to = conversation.externalId; // customer's wa_id

    const payload =
      message.kind === "text"
        ? { type: "text", text: { body: message.text, preview_url: true } }
        : {
            type: "template",
            template: {
              name: message.name,
              language: { code: message.language },
              components: message.params.length
                ? [{ type: "body", parameters: message.params.map((text) => ({ type: "text", text })) }]
                : undefined,
            },
          };

    const res = await graph<SendResponse>(`${env.whatsapp.phoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
    });
    return { externalId: res.messages?.[0]?.id };
  },
};

// ---------------------------------------------------------------------------
// Templates (needed to message a customer outside the 24h window)
// ---------------------------------------------------------------------------

export type WhatsAppTemplate = {
  name: string;
  language: string;
  body: string;
  /** Number of distinct {{1}}, {{2}}... placeholders in the body. */
  paramCount: number;
};

/** All APPROVED templates, in full (header, body, buttons…). Follows paging. */
export async function listTemplates(): Promise<Template[]> {
  const all: RawTemplate[] = [];
  let path: string | null =
    `${env.whatsapp.businessAccountId}/message_templates?fields=name,language,status,category,parameter_format,components&limit=200`;
  while (path) {
    const page: { data: RawTemplate[]; paging?: { cursors?: { after?: string }; next?: string } } = await graph(path);
    all.push(...page.data);
    const after = page.paging?.next ? page.paging.cursors?.after : undefined;
    path = after && all.length < 2000 ? `${path.split("&after=")[0]}&after=${encodeURIComponent(after)}` : null;
  }
  return all.filter((t) => t.status === "APPROVED").map(parseTemplate);
}

export async function listApprovedTemplates(): Promise<WhatsAppTemplate[]> {
  const res = await graph<{ data: RawTemplate[] }>(
    `${env.whatsapp.businessAccountId}/message_templates?fields=name,language,status,components&limit=200`,
  );
  return res.data
    .filter((t) => t.status === "APPROVED")
    .map((t) => {
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
      return { name: t.name, language: t.language, body, paramCount: countTemplateParams(body) };
    });
}

export function countTemplateParams(body: string): number {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

// ---------------------------------------------------------------------------
// Media: incoming images/audio/etc. only give us an id. We look up a
// short-lived URL and download it with our token (see /api/media/[mediaId]).
// ---------------------------------------------------------------------------

export async function downloadMedia(mediaId: string): Promise<Response> {
  const meta = await graph<{ url: string; mime_type: string }>(encodeURIComponent(mediaId));
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` } });
  if (!res.ok) throw new Error(`WhatsApp media download failed (${res.status})`);
  return res;
}

// ---------------------------------------------------------------------------
// Webhook parsing (pure function, no DB, easy to unit test)
// ---------------------------------------------------------------------------

export type WhatsAppStatusUpdate = {
  externalId: string; // wamid of a message WE sent
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  error?: string;
  errorCode?: number;
  timestamp?: Date;
};

const STATUS_VALUES = ["SENT", "DELIVERED", "READ", "FAILED"] as const;

/* eslint-disable @typescript-eslint/no-explicit-any -- webhook JSON is loosely typed */
export function parseWhatsAppWebhook(payload: any): {
  messages: InboundMessage[];
  statuses: WhatsAppStatusUpdate[];
} {
  const messages: InboundMessage[] = [];
  const statuses: WhatsAppStatusUpdate[] = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};

      // Profile names come in a separate "contacts" array keyed by wa_id.
      const names: Record<string, string | undefined> = {};
      for (const c of value.contacts ?? []) names[c.wa_id] = c.profile?.name;

      for (const m of value.messages ?? []) {
        messages.push({
          channel: "WHATSAPP",
          conversationExternalId: m.from,
          contact: { name: names[m.from] ?? null, phone: "+" + m.from },
          message: {
            externalId: m.id,
            senderType: "CUSTOMER",
            ...extractContent(m),
            // Set when they replied to (or tapped a button on) one of our messages.
            replyToExternalId: m.context?.id ?? null,
            raw: m,
            timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined,
          },
        });
      }

      for (const s of value.statuses ?? []) {
        const status = String(s.status).toUpperCase() as WhatsAppStatusUpdate["status"];
        if (!STATUS_VALUES.includes(status)) continue;
        const err = s.errors?.[0];
        statuses.push({
          externalId: s.id,
          status,
          error: err ? (err.error_data?.details ?? err.title ?? err.message) : undefined,
          errorCode: err?.code,
          timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000) : undefined,
        });
      }
    }
  }

  return { messages, statuses };
}

/** Turn one WhatsApp message object into type/body/media fields. */
function extractContent(m: any): { type: string; body?: string; mediaId?: string; mimeType?: string } {
  switch (m.type) {
    case "text":
      return { type: "text", body: m.text?.body };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker": {
      const media = m[m.type];
      return {
        type: m.type,
        body: media?.caption ?? media?.filename,
        mediaId: media?.id,
        mimeType: media?.mime_type,
      };
    }
    case "location": {
      const l = m.location;
      const label = [l?.name, l?.address].filter(Boolean).join(", ");
      return { type: "location", body: `${label ? label + " — " : ""}${l?.latitude},${l?.longitude}` };
    }
    case "contacts": {
      const names = (m.contacts ?? []).map((c: any) => c.name?.formatted_name).filter(Boolean);
      return { type: "contacts", body: `Shared contact: ${names.join(", ") || "unknown"}` };
    }
    case "interactive":
      return {
        type: "interactive",
        body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title,
      };
    case "button": // quick-reply tap on a template (e.g. a campaign)
      return { type: "button", body: m.button?.text };
    case "reaction":
      return { type: "reaction", body: `Reacted ${m.reaction?.emoji ?? ""}`.trim() };
    default:
      return { type: "other", body: `[Unsupported message type: ${m.type}]` };
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
