import type { TreatmentIntensity } from "@prisma/client";
import { buildGscSiteCurve, ctrForPosition } from "./ctr-curve.js";
import type {
  CampaignIntensityResult,
  PositionBucket,
  QueryDemandInput,
  QueryIntensityResult,
  TrafficModelInput,
} from "./types.js";

export const TREATMENT_MULTIPLIERS: Record<TreatmentIntensity, number> = {
  low: 1.25,
  normal: 1.5,
  strong: 2.0,
};

const MIN_SESSIONS_PER_QUERY = 1;

export interface IntensityCalculatorOptions {
  queries: QueryDemandInput[];
  trafficModel: TrafficModelInput;
  siteCurveData?: Array<{ position: number; ctr: number; impressions: number }> | null;
  activeIdentityCount?: number | null;
  maxSessionsPerIdentityPerDay?: number;
  repeatIdentityMinGapDays?: number;
}

function scale28d(value: number, campaignDays: number): number {
  return value * (campaignDays / 28);
}

function scale30d(value: number, campaignDays: number): number {
  return value * (campaignDays / 30);
}

function resolveSiteCurve(
  trafficModel: TrafficModelInput,
  siteCurveData: IntensityCalculatorOptions["siteCurveData"],
): PositionBucket[] | null {
  if (trafficModel.ctrSource !== "gsc_site_curve" || !siteCurveData?.length) {
    return null;
  }
  return buildGscSiteCurve(siteCurveData);
}

function computeQueryIntensity(
  query: QueryDemandInput,
  trafficModel: TrafficModelInput,
  siteCurve: PositionBucket[] | null,
  multiplier: number,
): QueryIntensityResult {
  const campaignDays = trafficModel.campaignDurationDays;
  const position = query.startingPosition ?? 30;
  const expectedCtr = ctrForPosition(position, siteCurve);

  const monthlyVolume = query.monthlySearchVolume ?? 0;
  const gscImpressions = query.gscImpressions28d ?? 0;
  const gscClicks = query.gscClicks28d ?? 0;

  const estimatedMarketSearches = monthlyVolume > 0 ? scale30d(monthlyVolume, campaignDays) : 0;

  let estimatedPageImpressions = 0;
  let expectedBaselineClicks = 0;
  let demandSource: QueryIntensityResult["demandSource"] = "minimum";

  if (gscImpressions > 0) {
    estimatedPageImpressions = scale28d(gscImpressions, campaignDays);
    if (gscClicks > 0) {
      expectedBaselineClicks = scale28d(gscClicks, campaignDays);
    } else {
      expectedBaselineClicks = estimatedPageImpressions * expectedCtr;
    }
    demandSource = "gsc";
  } else if (monthlyVolume > 0) {
    estimatedPageImpressions = estimatedMarketSearches;
    expectedBaselineClicks = estimatedMarketSearches * expectedCtr;
    demandSource = "volume";
  } else {
    expectedBaselineClicks = expectedCtr * 100;
    demandSource = "minimum";
  }

  const rawTreatmentSessions = Math.max(
    MIN_SESSIONS_PER_QUERY,
    Math.round(expectedBaselineClicks * multiplier),
  );

  const caps: number[] = [rawTreatmentSessions];

  if (monthlyVolume > 0) {
    caps.push(Math.floor(estimatedMarketSearches * trafficModel.maxShareOfSearchDemand));
  }
  if (gscImpressions > 0) {
    caps.push(
      Math.floor(estimatedPageImpressions * trafficModel.maxShareOfGscImpressions),
    );
  }

  const cappedTreatmentSessions = Math.max(
    MIN_SESSIONS_PER_QUERY,
    Math.min(...caps.filter((c) => c > 0)),
  );

  return {
    query: query.text,
    type: query.type,
    weight: query.weight,
    monthlySearchVolume: query.monthlySearchVolume ?? null,
    startingPosition: query.startingPosition ?? null,
    gscImpressions28d: query.gscImpressions28d ?? null,
    gscClicks28d: query.gscClicks28d ?? null,
    estimatedMarketSearches: Math.round(estimatedMarketSearches),
    estimatedPageImpressions: Math.round(estimatedPageImpressions),
    expectedBaselineClicks: Math.round(expectedBaselineClicks * 100) / 100,
    rawTreatmentSessions,
    cappedTreatmentSessions,
    allocatedSessions: cappedTreatmentSessions,
    expectedCtr,
    demandSource,
  };
}

export function estimateFeasibleSessions(
  totalSessions: number,
  identityCount: number,
  campaignDays: number,
  maxPerDay: number,
  minGapDays: number,
): { suggestedIdentities: number; feasibleSessions: number } {
  const sessionsPerIdentity = Math.floor(campaignDays / (minGapDays + 1)) * maxPerDay;
  const feasibleFromPool = identityCount * Math.max(sessionsPerIdentity, 1);
  const suggestedIdentities = Math.ceil(totalSessions / Math.max(sessionsPerIdentity, 1));

  return {
    suggestedIdentities,
    feasibleSessions: Math.min(totalSessions, feasibleFromPool),
  };
}

export function calculateCampaignIntensity(
  options: IntensityCalculatorOptions,
): CampaignIntensityResult {
  const multiplier = TREATMENT_MULTIPLIERS[options.trafficModel.treatmentIntensity];
  const siteCurve = resolveSiteCurve(options.trafficModel, options.siteCurveData);

  const queries = options.queries.map((query) =>
    computeQueryIntensity(query, options.trafficModel, siteCurve, multiplier),
  );

  const totalBaselineClicks = queries.reduce((sum, q) => sum + q.expectedBaselineClicks, 0);
  const totalTreatmentSessions = queries.reduce((sum, q) => sum + q.rawTreatmentSessions, 0);
  const totalAllocatedSessions = queries.reduce((sum, q) => sum + q.allocatedSessions, 0);

  let suggestedIdentities = Math.ceil(totalAllocatedSessions / 3);
  let feasibleSessions: number | null = null;
  const activeCount = options.activeIdentityCount ?? null;

  if (activeCount != null) {
    const feasibility = estimateFeasibleSessions(
      totalAllocatedSessions,
      activeCount,
      options.trafficModel.campaignDurationDays,
      options.maxSessionsPerIdentityPerDay ?? 1,
      options.repeatIdentityMinGapDays ?? 2,
    );
    suggestedIdentities = feasibility.suggestedIdentities;
    feasibleSessions = feasibility.feasibleSessions;
  }

  const identityDeficit =
    activeCount != null ? Math.max(0, suggestedIdentities - activeCount) : null;

  return {
    queries,
    totalBaselineClicks: Math.round(totalBaselineClicks * 100) / 100,
    totalTreatmentSessions,
    totalAllocatedSessions,
    suggestedIdentities,
    activeIdentityCount: activeCount,
    identityDeficit,
    feasibleSessions,
    treatmentMultiplier: multiplier,
  };
}

export function normalizeQueryWeights(results: QueryIntensityResult[]): QueryIntensityResult[] {
  const total = results.reduce((sum, q) => sum + q.allocatedSessions, 0);
  if (total <= 0) return results;

  return results.map((q) => ({
    ...q,
    weight: Number((q.allocatedSessions / total).toFixed(4)),
  }));
}
