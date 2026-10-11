import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { continueInNewRequest, runCampaigns } from "@/lib/marketing/campaign-runner";
import { createCampaign, listCampaigns } from "@/lib/marketing/campaigns";

// Sending continues after the response (see after() below), within this limit.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

const valueSource = z.discriminatedUnion("from", [
  z.object({ from: z.literal("text"), value: z.string().max(1000) }),
  z.object({
    from: z.literal("contact"),
    field: z.union([z.enum(["name", "first_name", "phone", "email"]), z.string().regex(/^attr:[a-z0-9_]+$/)]),
    fallback: z.string().max(1000),
  }),
]);
const sources = z.record(z.string(), valueSource);

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  templateName: z.string().min(1),
  templateLanguage: z.string().min(1),
  variables: z.object({
    header: sources.default({}),
    headerMediaUrl: z.url().optional(),
    body: sources.default({}),
    buttons: z.record(z.string(), sources).default({}),
  }),
  segmentId: z.string().nullable(),
  /** ISO time, or null to send now. */
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
});

// GET /api/campaigns → campaigns with their funnel stats
export async function GET() {
  return NextResponse.json(await listCampaigns());
}

// POST /api/campaigns → create; "send now" campaigns start right after the response.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign" }, { status: 400 });
  }
  const { scheduledAt, variables, ...rest } = parsed.data;

  try {
    const campaign = await createCampaign({
      ...rest,
      variables: variables as Parameters<typeof createCampaign>[0]["variables"],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    });

    if (!scheduledAt) {
      const origin = req.nextUrl.origin;
      after(async () => {
        const { more } = await runCampaigns(Date.now() + WORK_BUDGET_MS);
        if (more) await continueInNewRequest(origin);
      });
    }
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
