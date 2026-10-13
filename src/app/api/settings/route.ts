import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/settings";

// GET /api/settings → editable settings + what's configured (never the secrets themselves)
export async function GET() {
  return NextResponse.json({
    pricing: await getSetting("pricing"),
    status: { apiKey: Boolean(env.apiKey), cronSecret: Boolean(env.cronSecret) },
  });
}

const schema = z.object({
  pricing: z
    .object({ currency: z.string().min(3).max(3), MARKETING: z.number().min(0).max(100), UTILITY: z.number().min(0).max(100), AUTHENTICATION: z.number().min(0).max(100) })
    .optional(),
});

// PUT /api/settings { pricing? }
export async function PUT(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
  if (parsed.data.pricing) await setSetting("pricing", parsed.data.pricing);
  return NextResponse.json({ ok: true });
}
