import { z } from "zod";

// Request validation for template drafts. The detailed WhatsApp rules (lengths, variables,
// button combinations…) are checked by validateDraft() in ./template-builder.ts.

const header = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }),
  z.object({ type: z.literal("TEXT"), text: z.string().max(200), example: z.string().max(200).default("") }),
  z.object({
    type: z.enum(["IMAGE", "VIDEO", "DOCUMENT"]),
    handle: z.string().max(2000).optional(),
    sampleUrl: z.string().max(4000).optional(),
  }),
]);

const button = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().max(100) }),
  z.object({ type: z.literal("URL"), text: z.string().max(100), url: z.string().max(2100), example: z.string().max(2000).default("") }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().max(100), phone: z.string().max(40) }),
  z.object({ type: z.literal("COPY_CODE"), example: z.string().max(100) }),
]);

export const draftSchema = z.object({
  name: z.string().max(512).default(""),
  language: z.string().max(20).default("en"),
  category: z.enum(["MARKETING", "UTILITY"]),
  parameterFormat: z.enum(["POSITIONAL", "NAMED"]).default("POSITIONAL"),
  header,
  body: z.object({ text: z.string().max(2000), examples: z.record(z.string(), z.string().max(500)).default({}) }),
  footer: z.string().max(200).default(""),
  buttons: z.array(button).max(12).default([]),
});
