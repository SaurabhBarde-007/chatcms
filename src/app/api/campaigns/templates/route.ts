import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/channels/whatsapp";
import { errorResponse } from "@/lib/errors";

// GET /api/campaigns/templates → approved templates in full (unsupported ones say why)
export async function GET() {
  try {
    return NextResponse.json(await listTemplates());
  } catch (err) {
    return errorResponse(err);
  }
}
