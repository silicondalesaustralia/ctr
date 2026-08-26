import type { CtrSource, TreatmentIntensity } from "@prisma/client";

export type { TreatmentIntensity, CtrSource };

export interface QueryDemandInput {
  text: string;
  type: string;
  weight: number;
  monthlySearchVolume?: number | null;
  startingPosition?: number | null;
  gscImpressions28d?: number | null;
  gscClicks28d?: number | null;
}

export interface TrafficModelInput {
  campaignDurationDays: number;
  treatmentIntensity: TreatmentIntensity;
  maxShareOfSearchDemand: number;
  maxShareOfGscImpressions: number;
  ctrSource: CtrSource;
  desktopPercent: number;
}

export interface QueryIntensityResult {
  query: string;
  type: string;
  weight: number;
  monthlySearchVolume: number | null;
  startingPosition: number | null;
  gscImpressions28d: number | null;
  gscClicks28d: number | null;
  estimatedMarketSearches: number;
  estimatedPageImpressions: number;
  expectedBaselineClicks: number;
  rawTreatmentSessions: number;
  cappedTreatmentSessions: number;
  allocatedSessions: number;
  expectedCtr: number;
  demandSource: "gsc" | "volume" | "minimum";
}

export interface CampaignIntensityResult {
  queries: QueryIntensityResult[];
  totalBaselineClicks: number;
  totalTreatmentSessions: number;
  totalAllocatedSessions: number;
  suggestedIdentities: number;
  activeIdentityCount: number | null;
  identityDeficit: number | null;
  feasibleSessions: number | null;
  treatmentMultiplier: number;
}

export interface GscQueryMetrics {
  query: string;
  position: number;
  impressions28d: number;
  clicks28d: number;
  ctr: number;
}

export interface PositionBucket {
  min: number;
  max: number;
  avgCtr: number;
  sampleSize: number;
}
