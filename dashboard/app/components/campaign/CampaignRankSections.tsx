import CoverageGridSection from "../grid/CoverageGridSection";
import NationalPanelSection from "../national/NationalPanelSection";
import RankTimeline from "./RankTimeline";
import type { CampaignFormState } from "./shared";

interface Props {
  campaignId: string;
  form: CampaignFormState;
}

/** GMB: coverage grid and scan history. URL: rank graph and check history, plus the city panel when national. */
export default function CampaignRankSections({ campaignId, form }: Props) {
  const keyword = form.keyword.trim() || form.queries.find((row) => row.active)?.text || "";
  if (form.campaignKind === "gmb") return <CoverageGridSection campaignId={campaignId} />;
  const national = !form.focusCity && (!form.region || form.region.toUpperCase() === "ALL");
  if (!keyword) return null;
  return (
    <>
      <RankTimeline campaignId={campaignId} keyword={keyword} />
      {national && <NationalPanelSection campaignId={campaignId} keyword={keyword} />}
    </>
  );
}
