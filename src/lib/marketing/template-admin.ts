import { env } from "../env";
import { submittedDates } from "./template-drafts";
import { db } from "../db";
import { UserError } from "../errors";
import { graph, WhatsAppApiError } from "../channels/whatsapp";
import {
  draftToComponents,
  draftToCreatePayload,
  isEditableStatus,
  type TemplateDraft,
  templateToDraft,
  validateDraft,
} from "./template-builder";

// Managing templates in your WhatsApp Business Account: list (every status), create, edit,
// delete, and uploading sample media for headers. Meta is the source of truth, so templates
// made here also appear in WhatsApp Manager and vice versa.

export class TemplateError extends UserError {}

const FIELDS = "id,name,language,status,category,parameter_format,components,rejected_reason,quality_score,message_send_ttl_seconds";

export type TemplateRowDTO = {
  /** When it was submitted from this app (WhatsApp doesn't report creation dates). */
  createdAt?: string | null;
  id: string;
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED | IN_APPEAL | …
  category: string;
  rejectedReason: string | null;
  quality: string | null; // GREEN | YELLOW | RED | UNKNOWN
  editable: boolean;
  draft: TemplateDraft;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- Graph API JSON is loosely typed */
function toRow(t: any): TemplateRowDTO {
  return {
    id: String(t.id),
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
    rejectedReason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    quality: t.quality_score?.score ?? null,
    editable: isEditableStatus(t.status),
    draft: templateToDraft(t),
  };
}

/** Every template in the account, any status, newest first (as Meta returns them). */
export async function listAllTemplates(): Promise<TemplateRowDTO[]> {
  const [rows, dates] = await Promise.all([fetchAllTemplates(), submittedDates()]);
  return rows.map((r) => ({ ...r, createdAt: dates.get(r.id) ?? null }));
}

async function fetchAllTemplates(): Promise<TemplateRowDTO[]> {
  const rows: TemplateRowDTO[] = [];
  let after: string | undefined;
  do {
    const page: any = await graph(
      `${env.whatsapp.businessAccountId}/message_templates?fields=${FIELDS}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    rows.push(...page.data.map(toRow));
    after = page.paging?.next ? page.paging?.cursors?.after : undefined;
  } while (after && rows.length < 1000);
  return rows;
}

export async function getTemplate(id: string): Promise<TemplateRowDTO> {
  if (!/^\d+$/.test(id)) throw new TemplateError("Template not found");
  return toRow(await graph(`${encodeURIComponent(id)}?fields=${FIELDS}`));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function assertValid(draft: TemplateDraft, mode: "create" | "edit") {
  const problems = validateDraft(draft, mode);
  if (problems.length) throw new TemplateError(problems.join(" · "));
}

/** Submit a new template for WhatsApp's review. */
export async function createTemplate(input: TemplateDraft): Promise<{ id: string; status: string; category: string }> {
  assertValid(input, "create");
  const draft = await withUploadedHeader(input);
  try {
    const res = await graph<{ id: string; status: string; category: string }>(
      `${env.whatsapp.businessAccountId}/message_templates`,
      { method: "POST", body: JSON.stringify(draftToCreatePayload(draft)) },
    );
    return res;
  } catch (err) {
    throw friendlier(err, draft);
  }
}

/**
 * Change an existing template (it goes back to review). Name and language can't change.
 * Meta wants the whole template again, including the header sample — if you didn't upload a
 * new one, the current sample is re-uploaded for you.
 */
export async function updateTemplate(id: string, draft: TemplateDraft): Promise<void> {
  const current = await getTemplate(id);
  if (!current.editable) {
    const state = current.status === "PENDING" ? "in review" : current.status.toLowerCase().replace(/_/g, " ");
    throw new TemplateError(`A template that is ${state} can't be edited. Only approved, rejected or paused ones can.`);
  }
  // Name, language, variable style and time-to-live are fixed once a template exists.
  const next = await withUploadedHeader({
    ...draft,
    name: current.name,
    language: current.language,
    parameterFormat: current.draft.parameterFormat,
    ttl: current.draft.ttl,
  });
  assertValid(next, "edit");

  try {
    await graph(`${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({
        ...(next.category !== current.category && { category: next.category }),
        components: draftToComponents(next),
      }),
    });
  } catch (err) {
    throw friendlier(err, next);
  }
}

/**
 * Media headers need an upload handle. When the draft only has an existing sample (editing, or a
 * duplicated template), that sample is uploaded again for you.
 */
async function withUploadedHeader(draft: TemplateDraft): Promise<TemplateDraft> {
  const h = draft.header;
  if (draft.category === "AUTHENTICATION" || h.type === "NONE" || h.type === "TEXT" || h.handle) return draft;
  if (!h.sampleUrl) throw new TemplateError("Upload a sample for the header");
  return { ...draft, header: { ...h, handle: (await uploadSampleFromUrl(h.sampleUrl)).handle } };
}

/** Delete one template (this language only). */
export async function deleteTemplate(id: string): Promise<void> {
  const t = await getTemplate(id);
  const busy = await db.campaign.count({
    where: { templateName: t.name, templateLanguage: t.language, status: { in: ["SCHEDULED", "SENDING"] } },
  });
  if (busy) throw new TemplateError("A scheduled or sending campaign uses this template. Cancel it first.");
  await graph(
    `${env.whatsapp.businessAccountId}/message_templates?hsm_id=${encodeURIComponent(id)}&name=${encodeURIComponent(t.name)}`,
    { method: "DELETE" },
  );
}

function friendlier(err: unknown, draft: TemplateDraft): unknown {
  if (err instanceof WhatsAppApiError && /already exists/i.test(err.message)) {
    return new TemplateError(`A template named "${draft.name}" already exists in ${draft.language}. Pick another name, or edit that one.`);
  }
  return err;
}

// ---------------------------------------------------------------------------
// Sample media for headers (Meta's Resumable Upload API → a "handle")
// ---------------------------------------------------------------------------

export const SAMPLE_TYPES: Record<string, { header: "IMAGE" | "VIDEO" | "DOCUMENT"; maxBytes: number }> = {
  "image/jpeg": { header: "IMAGE", maxBytes: 5 * 1024 * 1024 },
  "image/png": { header: "IMAGE", maxBytes: 5 * 1024 * 1024 },
  "video/mp4": { header: "VIDEO", maxBytes: 16 * 1024 * 1024 },
  "application/pdf": { header: "DOCUMENT", maxBytes: 100 * 1024 * 1024 },
};

let cachedAppId: string | null = null;

/** The Meta App ID (WA_APP_ID, or looked up from the access token). */
async function appId(): Promise<string> {
  if (env.whatsapp.appId) return env.whatsapp.appId;
  if (!cachedAppId) {
    const app = await graph<{ id: string }>("app");
    cachedAppId = app.id;
  }
  return cachedAppId;
}

export async function uploadSample(bytes: ArrayBuffer, mimeType: string, fileName: string): Promise<{ handle: string }> {
  const type = SAMPLE_TYPES[mimeType];
  if (!type) throw new TemplateError("Use a JPG or PNG image, an MP4 video, or a PDF");
  if (bytes.byteLength > type.maxBytes) throw new TemplateError(`File too large (max ${type.maxBytes / 1024 / 1024} MB)`);

  const session = await graph<{ id: string }>(
    `${await appId()}/uploads?file_name=${encodeURIComponent(fileName)}&file_length=${bytes.byteLength}&file_type=${encodeURIComponent(mimeType)}`,
    { method: "POST" },
  );

  // The upload step authenticates with "OAuth <token>" and sends the raw bytes.
  const res = await fetch(`${env.whatsapp.graphBaseUrl}/${env.whatsapp.graphVersion}/${session.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${env.whatsapp.accessToken}`, file_offset: "0" },
    body: bytes,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.h) {
    throw new WhatsAppApiError(data?.error?.message ?? `Sample upload failed (${res.status})`, data?.error?.code, res.status);
  }
  return { handle: data.h };
}

/** Download a public file and upload it as a sample (also used to re-upload on edit). */
export async function uploadSampleFromUrl(url: string): Promise<{ handle: string }> {
  // https only — except in local tests, where the fake Graph API serves samples over http.
  const testing = env.whatsapp.graphBaseUrl.startsWith("http://localhost");
  if (!/^https:\/\//.test(url) && !(testing && /^http:\/\/localhost[:/]/.test(url))) {
    throw new TemplateError("Use an https:// link");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new TemplateError(`Couldn't download the sample (${res.status})`);
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const bytes = await res.arrayBuffer();
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "sample");
  return uploadSample(bytes, mimeType, name);
}
