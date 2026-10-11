import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { updateContact } from "@/lib/marketing/contacts";

const patchSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(50)).max(50).optional(),
  optInStatus: z.enum(["OPTED_IN", "OPTED_OUT"]).optional(),
});

// PATCH /api/contacts/:id  { name?, email?, tags?, optInStatus? }
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/contacts/[id]">) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact update" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await updateContact(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
