import { NextResponse, type NextRequest } from "next/server";
import { draftSchema } from "@/lib/marketing/template-draft-schema";
import { listDrafts, saveDraft } from "@/lib/marketing/template-drafts";

// GET /api/templates/drafts → unfinished templates
export async function GET() {
  return NextResponse.json(await listDrafts());
}

// POST /api/templates/drafts (a draft) → { id }
export async function POST(req: NextRequest) {
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft" }, { status: 400 });
  return NextResponse.json(await saveDraft(parsed.data), { status: 201 });
}
