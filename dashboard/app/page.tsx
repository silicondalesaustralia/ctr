"use client";

import AuthGate from "./components/AuthGate";
import CampaignDashboard from "./components/CampaignDashboard";

export default function HomePage() {
  return (
    <AuthGate>
      <CampaignDashboard />
    </AuthGate>
  );
}
