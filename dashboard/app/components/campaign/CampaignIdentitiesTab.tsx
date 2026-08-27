"use client";

import CampaignIdentityPicker from "./CampaignIdentityPicker";

interface Props {
  campaignId: string;
  regionLabel: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  readonly?: boolean;
}

export default function CampaignIdentitiesTab({
  campaignId,
  regionLabel,
  selectedIds,
  onSelectionChange,
  readonly = false,
}: Props) {
  return (
    <CampaignIdentityPicker
      campaignId={campaignId}
      regionLabel={regionLabel}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      readonly={readonly}
    />
  );
}
