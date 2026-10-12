import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { upsertFromOptInApi } from "@/lib/marketing/contacts";

// POST /api/contacts/opt-in — for your website / forms ("Send me offers on WhatsApp").
// Auth: Authorization: Bearer <API_KEY>. Docs: docs/OPT_IN_API.md

const bodySchema = z.object({
  phone: z.string().min(5).max(30),
  name: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
  school: z.string().max(200).optional(),
  class: z.string().max(50).optional(),
  optedIn: z.boolean().optional(),
});

function authorized(req: NextRequest): boolean {
  const key = env.optInApiKey;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key || given.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await upsertFromOptInApi(parsed.data)) });
  } catch (err) {
    return errorResponse(err);
  }
}
