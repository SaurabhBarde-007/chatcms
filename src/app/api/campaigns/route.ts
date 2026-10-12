import { after, NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { continueInNewRequest, runCampaigns } from "@/lib/marketing/campaign-runner";
import { createCampaignSchema } from "@/lib/marketing/campaign-schema";
import { createCampaign, listCampaigns } from "@/lib/marketing/campaigns";
import type { TemplateVariables } from "@/lib/marketing/templates";

// Sending continues after the response (see after() below), within this limit.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

// GET /api/campaigns → campaigns with their funnel stats
export async function GET() {
  return NextResponse.json(await listCampaigns());
}

// POST /api/campaigns → create a broadcast (now / scheduled) or an API campaign
export async function POST(req: NextRequest) {
  const parsed = createCampaignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign" }, { status: 400 });
  }
  const body = parsed.data;
  const variables = body.variables as TemplateVariables;

  try {
    if (body.type === "API") {
      return NextResponse.json(await createCampaign({ ...body, variables }), { status: 201 });
    }
    const campaign = await createCampaign({ ...body, variables, scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null });
    if (!body.scheduledAt) {
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
