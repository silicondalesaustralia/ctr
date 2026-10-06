import CoverageGridSection from "../grid/CoverageGridSection";
import NationalPanelSection from "../national/NationalPanelSection";
import RankTimeline from "./RankTimeline";
import type { CampaignFormState } from "./shared";

interface Props {
  campaignId: string;
  form: CampaignFormState;
}

/** Rank over time for every campaign, plus the coverage grid (GMB) or city panel (national URL). */
export default function CampaignRankSections({ campaignId, form }: Props) {
  const keyword = form.keyword.trim() || form.queries.find((row) => row.active)?.text || "";
  const isGmb = form.campaignKind === "gmb";
  const national = !isGmb && !form.focusCity && (!form.region || form.region.toUpperCase() === "ALL");
  return (
    <>
      {keyword && <RankTimeline campaignId={campaignId} keyword={keyword} />}
      {isGmb && <CoverageGridSection campaignId={campaignId} />}
      {national && keyword && <NationalPanelSection campaignId={campaignId} keyword={keyword} />}
    </>
  );
}
