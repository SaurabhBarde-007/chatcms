import crypto from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { continueInNewRequest, runCampaigns } from "@/lib/marketing/campaign-runner";

// Starts due campaigns and keeps sending. Called by:
//   - GitHub Actions every 30 min (.github/workflows/campaign-scheduler.yml)
//   - this app itself, to continue a big campaign in a fresh request
// Auth: Authorization: Bearer <CRON_SECRET>. Answers 202 at once; the work runs after the response.

export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

function authorized(req: NextRequest): boolean {
  const secret = env.cronSecret;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

async function handle(req: NextRequest) {
  if (!env.cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = req.nextUrl.origin;
  after(async () => {
    const { more } = await runCampaigns(Date.now() + WORK_BUDGET_MS);
    if (more) await continueInNewRequest(origin);
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}

export const POST = handle;
export const GET = handle; // Vercel Cron uses GET, if you switch to it later
