import { Suspense } from "react";
import { CampaignForm } from "@/components/campaigns/CampaignForm";

export default function NewCampaignPage() {
  // CampaignForm reads ?template= from the URL, which needs a Suspense boundary.
  return (
    <Suspense>
      <CampaignForm />
    </Suspense>
  );
}
