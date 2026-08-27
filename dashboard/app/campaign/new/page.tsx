"use client";

import AuthGate from "../../components/AuthGate";
import CampaignDashboard from "../../components/CampaignDashboard";

export default function NewCampaignPage() {
  return (
    <AuthGate>
      <CampaignDashboard isNew />
    </AuthGate>
  );
}
