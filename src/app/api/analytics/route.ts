import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAnalytics, isValidTimeZone } from "@/lib/marketing/analytics";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  tz: z.string().default("UTC"),
});

// GET /api/analytics?days=30&tz=Asia/Kolkata → inbox, campaign and audience analytics
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  const tz = isValidTimeZone(parsed.data.tz) ? parsed.data.tz : "UTC";
  return NextResponse.json(await getAnalytics(parsed.data.days, tz));
}
