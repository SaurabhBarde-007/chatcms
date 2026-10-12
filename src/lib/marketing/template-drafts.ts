import { db } from "../db";
import { normalizeDraft, type TemplateDraft } from "./template-builder";

// Templates you're still writing (Draft tab), and a record of what was submitted from here
// (gives the templates list its "Created" date).

export type DraftRowDTO = { id: string; name: string; language: string; category: string; updatedAt: string; draft: TemplateDraft };

export async function listDrafts(): Promise<DraftRowDTO[]> {
  const rows = await db.templateDraft.findMany({ where: { metaTemplateId: null }, orderBy: { updatedAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    language: r.language,
    category: r.category,
    updatedAt: r.updatedAt.toISOString(),
    draft: normalizeDraft(r.data as Partial<TemplateDraft>),
  }));
}

export async function getDraft(id: string): Promise<DraftRowDTO | null> {
  const r = await db.templateDraft.findUnique({ where: { id } });
  if (!r) return null;
  return { id: r.id, name: r.name, language: r.language, category: r.category, updatedAt: r.updatedAt.toISOString(), draft: normalizeDraft(r.data as Partial<TemplateDraft>) };
}

export async function saveDraft(draft: TemplateDraft, id?: string): Promise<{ id: string }> {
  const data = { name: draft.name, language: draft.language, category: draft.category, data: draft as object };
  const row = id ? await db.templateDraft.update({ where: { id }, data }) : await db.templateDraft.create({ data });
  return { id: row.id };
}

export async function deleteDraft(id: string): Promise<void> {
  await db.templateDraft.deleteMany({ where: { id, metaTemplateId: null } });
}

/** After submitting: keep the record (for "Created") and take it off the Draft tab. */
export async function recordSubmitted(draft: TemplateDraft, metaTemplateId: string, draftId?: string): Promise<void> {
  const data = { name: draft.name, language: draft.language, category: draft.category, data: draft as object, metaTemplateId, submittedAt: new Date() };
  if (draftId) await db.templateDraft.update({ where: { id: draftId }, data });
  else await db.templateDraft.create({ data });
}

/** When each template was submitted from this app, by WhatsApp template id. */
export async function submittedDates(): Promise<Map<string, string>> {
  const rows = await db.templateDraft.findMany({ where: { metaTemplateId: { not: null } }, select: { metaTemplateId: true, submittedAt: true } });
  return new Map(rows.filter((r) => r.submittedAt).map((r) => [r.metaTemplateId!, r.submittedAt!.toISOString()]));
}
