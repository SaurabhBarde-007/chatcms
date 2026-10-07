import { NextResponse } from "next/server";
import { listApprovedTemplates } from "@/lib/channels/whatsapp";

// GET /api/whatsapp/templates → approved templates, for the picker shown outside the 24h window
export async function GET() {
  try {
    return NextResponse.json(await listApprovedTemplates());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load templates" }, { status: 502 });
  }
}
