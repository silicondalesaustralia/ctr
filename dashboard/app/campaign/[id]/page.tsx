"use client";

import { Suspense, use } from "react";
import AuthGate from "../../components/AuthGate";
import CampaignDashboard from "../../components/CampaignDashboard";

function CampaignPageInner({ id }: { id: string }) {
  return (
    <AuthGate>
      <CampaignDashboard campaignId={id} />
    </AuthGate>
  );
}

export default function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <CampaignPageInner id={id} />
    </Suspense>
  );
}
