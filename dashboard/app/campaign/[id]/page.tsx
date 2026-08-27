"use client";

import { use } from "react";
import AuthGate from "../../components/AuthGate";
import CampaignDashboard from "../../components/CampaignDashboard";

export default function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AuthGate>
      <CampaignDashboard campaignId={id} />
    </AuthGate>
  );
}
