import type { CtrSource, TreatmentIntensity } from "@prisma/client";
import { calculateCampaignIntensity } from "./intensity-calculator.js";
import { generateQueryCluster } from "../experiments/query-generator.js";
import type { CampaignQueryInput } from "../experiments/campaign-service.js";
import { countEligibleIdentities } from "../warmup/warmup-service.js";
import { findRegionByCity } from "./geo-capacity.js";
import { parseGmbTarget } from "./gmb-target.js";
import {
  actionsFromFlags,
  flagsFromActions,
  type GmbAction,
  type GmbActionFlags,
} from "./gmb-types.js";
import type { CampaignProposal, SettingRationale } from "./campaign-proposal.js";

export interface GmbCampaignProposalInput {
  keyword: string;
  focusCity: string;
  gmbBusinessName: string;
  gmbMapsUrl: string;
  gmbActions?: GmbActionFlags | GmbAction[];
  monthlySearchVolume?: number | null;
}

export type GmbCampaignProposal = CampaignProposal & {
  campaignKind: "gmb";
  focusCity: string;
  gmbBusinessName: string;
  gmbPlaceId: string | null;
  gmbMapsUrl: string;
  gmbActions: GmbAction[];
};

export async function buildGmbCampaignProposal(
  input: GmbCampaignProposalInput,
): Promise<GmbCampaignProposal> {
  const keyword = input.keyword.trim();
  const businessName = input.gmbBusinessName.trim();
  const cityConfig = findRegionByCity(input.focusCity);
  if (!cityConfig) {
    throw new Error(`Unknown geo city: ${input.focusCity}`);
  }
  if (!businessName) {
    throw new Error("Business name is required for GMB campaigns");
  }

  const parsed = parseGmbTarget(input.gmbMapsUrl);
  const region = cityConfig.region;
  const flags = Array.isArray(input.gmbActions)
    ? flagsFromActions(input.gmbActions)
    : (input.gmbActions ?? flagsFromActions(null));
  const gmbActions = actionsFromFlags(flags);

  const queries: CampaignQueryInput[] = generateQueryCluster(keyword, region).map((q) => ({
    text: q.text,
    type: q.type,
    weight: q.weight,
    monthlySearchVolume: input.monthlySearchVolume ?? null,
    startingPosition: null,
  }));

  const eligible = await countEligibleIdentities(region, true, cityConfig.city);
  const campaignDurationDays = 21;
  const treatmentIntensity: TreatmentIntensity = "normal";
  const desktopPercent = 40;
  const ctrSource: CtrSource = "default_curve";

  const intensity = calculateCampaignIntensity({
    queries: queries.map((q) => ({
      text: q.text!,
      type: q.type ?? "core",
      weight: q.weight ?? 0,
      monthlySearchVolume: q.monthlySearchVolume,
      startingPosition: null,
      gscImpressions28d: null,
      gscClicks28d: null,
    })),
    trafficModel: {
      campaignDurationDays,
      treatmentIntensity,
      maxShareOfSearchDemand: 0.02,
      maxShareOfGscImpressions: 0.05,
      ctrSource,
      desktopPercent,
    },
    siteCurveData: null,
    activeIdentityCount: eligible,
    maxSessionsPerIdentityPerDay: 1,
    repeatIdentityMinGapDays: 2,
  });

  const rationales: SettingRationale[] = [
    {
      setting: "Campaign type",
      value: "GMB / local pack",
      reason: `Targets "${businessName}" in ${cityConfig.city} (${gmbActions.join(", ")}).`,
    },
    {
      setting: "Geo / proxies",
      value: `${cityConfig.city} (${region})`,
      reason: "Identity pool and Decodo exits are locked to this city.",
    },
    {
      setting: "Duration",
      value: `${campaignDurationDays} days`,
      reason: "Default without GSC; refine after local-pack preflight ranks.",
    },
    {
      setting: "Device mix",
      value: `${desktopPercent}% desktop`,
      reason: "Local pack behaviour is mobile-heavy.",
    },
    {
      setting: "Identities",
      value:
        intensity.identityDeficit && intensity.identityDeficit > 0
          ? `Need ${intensity.identityDeficit} more in ${cityConfig.city}`
          : `${eligible} eligible in ${cityConfig.city}`,
      reason: `Create ${cityConfig.city}-scoped identities if the pool is short.`,
    },
  ];

  return {
    campaignKind: "gmb",
    keyword,
    targetUrl: parsed.mapsUrl,
    region,
    focusCity: cityConfig.city,
    gmbBusinessName: businessName,
    gmbPlaceId: parsed.placeId ?? (parsed.cid ? `cid:${parsed.cid}` : null),
    gmbMapsUrl: parsed.mapsUrl,
    gmbActions,
    gscConnectionId: null,
    gscSiteUrl: null,
    campaignDurationDays,
    treatmentIntensity,
    adaptivePacing: true,
    recalculateEveryDays: 3,
    maxShareOfSearchDemand: 0.02,
    maxShareOfGscImpressions: 0.05,
    desktopPercent,
    ctrSource,
    queries: intensity.queries.map((row) => ({
      text: row.query,
      type: row.type,
      weight: row.weight,
      monthlySearchVolume: row.monthlySearchVolume,
      startingPosition: row.startingPosition,
      gscImpressions28d: null,
      gscClicks28d: null,
    })),
    intensity,
    rationales,
    gscStatus: "unavailable",
    gscQueryCount: 0,
    plannedSessionCap: intensity.totalAllocatedSessions,
    targetIdentityCount: intensity.suggestedIdentities,
    organicMaxSessionsPerIdentity: 2,
  };
}
