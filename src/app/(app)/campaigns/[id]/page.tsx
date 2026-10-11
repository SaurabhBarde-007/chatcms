import { CampaignDetail } from "@/components/campaigns/CampaignDetail";

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  return <CampaignDetail id={id} />;
}
