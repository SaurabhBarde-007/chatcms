import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/errors";
import { cancelPayment } from "@/lib/payments/payments";

// POST /api/payments/:id/cancel → cancel an unpaid link
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/payments/[id]/cancel">) {
  const { id } = await ctx.params;
  try {
    await cancelPayment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
