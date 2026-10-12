import { type NextRequest } from "next/server";
import { allRecipients, getCampaign, type Stage, STAGES, toCsv } from "@/lib/marketing/campaigns";
import { formatMoney } from "@/lib/payments/money";

// GET /api/campaigns/:id/report?stage= → recipients as CSV ("User report")
export async function GET(req: NextRequest, ctx: RouteContext<"/api/campaigns/[id]/report">) {
  const { id } = await ctx.params;
  const stageParam = req.nextUrl.searchParams.get("stage") ?? "all";
  const stage = (STAGES as readonly string[]).includes(stageParam) ? (stageParam as Stage) : "all";
  const campaign = await getCampaign(id);
  if (!campaign) return new Response("Not found", { status: 404 });

  const rows = await allRecipients(id, stage);
  const csv = toCsv([
    ["Name", "Phone", "Status", "Source", "Sent at", "Delivered at", "Read at", "Replied at", "Button tapped", "Payment", "Paid", "Error"],
    ...rows.map((r) => [
      r.name, r.phone, r.status, r.source, r.sentAt, r.deliveredAt, r.readAt, r.repliedAt, r.buttonText,
      r.payment ? r.payment.status : "", r.payment?.amountPaid ? formatMoney(r.payment.amountPaid) : "", r.error,
    ]),
  ]);
  const file = `${campaign.name.replace(/[^\w-]+/g, "_")}_${stage}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` } });
}
