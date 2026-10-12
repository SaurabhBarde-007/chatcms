import { NextResponse } from "next/server";
import { getAccountStatus } from "@/lib/marketing/account";

// GET /api/account/status → quality rating, messaging tier, remaining 24h quota
export async function GET() {
  return NextResponse.json(await getAccountStatus());
}
