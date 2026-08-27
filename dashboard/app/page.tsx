"use client";

import AuthGate from "./components/AuthGate";
import CampaignList from "./components/CampaignList";

export default function HomePage() {
  return (
    <AuthGate>
      <CampaignList />
    </AuthGate>
  );
}
