import { listCampaigns, toCsv } from "@/lib/marketing/campaigns";

// GET /api/campaigns/report → every campaign with its numbers, as CSV ("Download report")
export async function GET() {
  const campaigns = await listCampaigns();
  const csv = toCsv([
    ["Campaign", "Type", "Status", "Template", "Category", "Created", "Audience", "Sent", "Delivered", "Read", "Replied", "Button taps", "Failed", "Opted out", "Est. cost"],
    ...campaigns.map((c) => [
      c.name, c.type, c.status, `${c.templateName} (${c.templateLanguage})`, c.templateCategory, c.createdAt, c.audienceSize ?? c.stats.total,
      c.stats.sent, c.stats.delivered, c.stats.read, c.stats.replied, c.stats.clicked, c.stats.failed, c.stats.optedOut,
      c.estimatedCost.toFixed(2),
    ]),
  ]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="campaigns_report.csv"' } });
}
