import { z } from "zod";
import { triggerSchema } from "./api-trigger";

// Request validation for creating campaigns (shared by the routes).

const valueSource = z.discriminatedUnion("from", [
  z.object({ from: z.literal("text"), value: z.string().max(1000) }),
  z.object({
    from: z.literal("contact"),
    field: z.union([z.enum(["name", "first_name", "phone", "email"]), z.string().regex(/^attr:[a-z0-9_]+$/)]),
    fallback: z.string().max(1000),
  }),
  z.object({
    from: z.literal("payment"),
    amount: z.number().min(0).max(500_000),
    amountField: z.string().regex(/^[a-z0-9_]+$/).optional(),
    description: z.string().max(500),
    expiresInHours: z.number().int().min(1).max(4320).optional(),
  }),
  z.object({ from: z.literal("api") }),
]);
const sources = z.record(z.string(), valueSource);

export const variablesSchema = z.object({
  header: sources.default({}),
  headerMediaUrl: z.url().optional(),
  body: sources.default({}),
  buttons: z.record(z.string(), sources).default({}),
});

const base = {
  name: z.string().trim().min(1).max(100),
  templateName: z.string().min(1),
  templateLanguage: z.string().min(1),
  variables: variablesSchema,
};

export const createCampaignSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("BROADCAST"),
    segmentId: z.string().nullable(),
    /** ISO time, or null to send now. */
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  z.object({ ...base, type: z.literal("API"), trigger: triggerSchema, live: z.boolean().default(true) }),
]);
