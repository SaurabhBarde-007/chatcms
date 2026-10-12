import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { createTemplate, listAllTemplates } from "@/lib/marketing/template-admin";
import { draftSchema } from "@/lib/marketing/template-draft-schema";
import { recordSubmitted } from "@/lib/marketing/template-drafts";

// GET /api/templates → every template in your WhatsApp Business Account (any status)
export async function GET() {
  try {
    return NextResponse.json(await listAllTemplates());
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/templates[?draftId=] (a draft) → submitted to WhatsApp for review
export async function POST(req: NextRequest) {
  const parsed = draftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template" }, { status: 400 });
  try {
    const created = await createTemplate(parsed.data);
    await recordSubmitted(parsed.data, created.id, req.nextUrl.searchParams.get("draftId") ?? undefined).catch((err) =>
      console.error("[templates] couldn't record submission:", err),
    );
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
