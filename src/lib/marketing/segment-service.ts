import { z } from "zod";
import { db } from "../db";
import { UserError } from "../errors";
import { describeRules, type SegmentRules, segmentRulesSchema, segmentWhere } from "./segments";

export const segmentBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  rules: segmentRulesSchema,
});

export class SegmentError extends UserError {}

export type SegmentDTO = {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRules;
  summary: string;
  /** Opted-in contacts matching right now. */
  size: number;
  createdAt: string;
};

export async function listSegments(): Promise<SegmentDTO[]> {
  const segments = await db.segment.findMany({ orderBy: { createdAt: "desc" } });
  return Promise.all(
    segments.map(async (s) => {
      const rules = segmentRulesSchema.parse(s.rules);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        rules,
        summary: describeRules(rules),
        size: await db.contact.count({ where: segmentWhere(rules) }),
        createdAt: s.createdAt.toISOString(),
      };
    }),
  );
}

/** Size + a few example contacts, for the live preview while editing rules. */
export async function previewSegment(rules: SegmentRules) {
  const where = segmentWhere(rules);
  const [size, sample] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({ where, take: 5, orderBy: { createdAt: "desc" }, select: { id: true, name: true, waId: true } }),
  ]);
  return { size, summary: describeRules(rules), sample: sample.map((c) => ({ id: c.id, name: c.name, phone: c.waId && "+" + c.waId })) };
}

export async function saveSegment(input: { id?: string; name: string; description?: string | null; rules: SegmentRules }) {
  const data = { name: input.name.trim(), description: input.description?.trim() || null, rules: input.rules as object };
  if (!data.name) throw new SegmentError("Give the segment a name.");
  return input.id ? db.segment.update({ where: { id: input.id }, data }) : db.segment.create({ data });
}

export async function deleteSegment(id: string) {
  const inUse = await db.campaign.count({ where: { segmentId: id, status: { in: ["SCHEDULED", "SENDING"] } } });
  if (inUse) throw new SegmentError("A scheduled or sending campaign uses this segment. Cancel it first.");
  await db.segment.delete({ where: { id } });
}
