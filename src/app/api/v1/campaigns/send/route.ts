import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { apiSendSchema, sendViaApi } from "@/lib/marketing/api-campaigns";

export const maxDuration = 60;

// POST /api/v1/campaigns/send — trigger an API campaign for one person from your own systems.
// Auth: Authorization: Bearer <API_KEY>. Docs: docs/API.md

function authorized(req: NextRequest): boolean {
  const key = env.apiKey;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key || given.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  const parsed = apiSendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  try {
    const { recipientId, outcome } = await sendViaApi(parsed.data);
    const ok = outcome.kind === "sent";
    return NextResponse.json(
      { ok, id: recipientId, status: outcome.kind, ...(outcome.message && { error: outcome.message }) },
      { status: ok ? 200 : outcome.kind === "retry" ? 202 : 422 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
