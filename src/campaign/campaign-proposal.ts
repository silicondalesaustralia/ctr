import type { CtrSource, TreatmentIntensity } from "@prisma/client";
import { fetchGscRowsForPage, fetchGscSiteCurveRows } from "../analytics/gsc-api.js";
import { resolveGscContext } from "../analytics/gsc-connection-service.js";
import { buildGscSiteCurve } from "./ctr-curve.js";
import { calculateCampaignIntensity, normalizeQueryWeights } from "./intensity-calculator.js";
import type { CampaignIntensityResult } from "./types.js";
import { generateQueryCluster } from "../experiments/query-generator.js";
import type { CampaignQueryInput } from "../experiments/campaign-service.js";
import { prisma } from "../db/client.js";

import type { PreflightSummary } from "./preflight-types.js";

export interface SettingRationale {
  setting: string;
  value: string;
  reason: string;
}

export interface CampaignProposalInput {
  keyword: string;
  targetUrl: string;
  region: string;
  gscConnectionId?: string | null;
  gscSiteUrl?: string | null;
}

export interface CampaignProposal {
  keyword: string;
  targetUrl: string;
  region: string;
  campaignDurationDays: number;
  treatmentIntensity: TreatmentIntensity;
  adaptivePacing: boolean;
  recalculateEveryDays: number;
  maxShareOfSearchDemand: number;
  maxShareOfGscImpressions: number;
  desktopPercent: number;
  ctrSource: CtrSource;
  queries: CampaignQueryInput[];
  intensity: CampaignIntensityResult;
  rationales: SettingRationale[];
  gscStatus: "live" | "unavailable";
  gscQueryCount: number;
  preflight?: PreflightSummary;
  plannedSessionCap?: number | null;
  targetIdentityCount?: number | null;
  organicMaxSessionsPerIdentity?: number;
}

function classifyQueryType(query: string, keyword: string): CampaignQueryInput["type"] {
  const q = query.toLowerCase();
  const k = keyword.toLowerCase();
  if (q === k) return "core";
  if (q.includes("australia") || q.includes("sydney") || q.includes("melbourne")) return "local";
  if (q.split(/\s+/).length >= 5) return "long_tail";
  return "close_variation";
}

function mergeQueriesFromGsc(
  keyword: string,
  region: string,
  gscRows: Array<{
    query: string;
    impressions: number;
    clicks: number;
    position: number;
  }>,
): CampaignQueryInput[] {
  const generated = generateQueryCluster(keyword, region);
  const byText = new Map<string, CampaignQueryInput>();

  for (const item of generated) {
    byText.set(item.text.toLowerCase(), {
      text: item.text,
      type: item.type,
      weight: item.weight,
    });
  }

  for (const row of gscRows.slice(0, 12)) {
    const key = row.query.toLowerCase();
    const existing = byText.get(key);
    byText.set(key, {
      text: row.query,
      type: existing?.type ?? classifyQueryType(row.query, keyword),
      weight: existing?.weight ?? 0,
      startingPosition: row.position,
      gscImpressions28d: row.impressions,
      gscClicks28d: row.clicks,
    });
  }

  const coreKey = keyword.toLowerCase();
  if (!byText.has(coreKey)) {
    byText.set(coreKey, { text: keyword, type: "core", weight: 0.35 });
  }

  return [...byText.values()];
}

function recommendIntensity(avgPosition: number): TreatmentIntensity {
  if (avgPosition >= 22) return "strong";
  if (avgPosition >= 12) return "normal";
  return "low";
}

function recommendDuration(totalImpressions: number): number {
  if (totalImpressions < 400) return 21;
  if (totalImpressions > 5000) return 14;
  return 14;
}

function intensityLabel(intensity: TreatmentIntensity): string {
  if (intensity === "strong") return "Strong (2× baseline)";
  if (intensity === "low") return "Low (1.25× baseline)";
  return "Normal (1.5× baseline)";
}

export async function buildCampaignProposal(
  input: CampaignProposalInput,
): Promise<CampaignProposal> {
  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();

  let gscRows: Awaited<ReturnType<typeof fetchGscRowsForPage>> = [];
  let gscStatus: CampaignProposal["gscStatus"] = "unavailable";
  const gscContext = await resolveGscContext(input.gscConnectionId, input.gscSiteUrl);

  if (gscContext) {
    try {
      gscRows = await fetchGscRowsForPage(targetUrl, gscContext, 28);
      gscStatus = gscRows.length > 0 ? "live" : "unavailable";
    } catch {
      gscStatus = "unavailable";
    }
  }

  const queries = mergeQueriesFromGsc(keyword, region, gscRows);

  const totalImpressions = gscRows.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition =
    totalImpressions > 0
      ? gscRows.reduce((sum, row) => sum + row.position * row.impressions, 0) / totalImpressions
      : queries.find((q) => q.text.toLowerCase() === keyword.toLowerCase())?.startingPosition ?? 25;

  const campaignDurationDays = recommendDuration(totalImpressions);
  const treatmentIntensity = recommendIntensity(weightedPosition);

  let siteCurveData: Array<{ position: number; ctr: number; impressions: number }> | null = null;
  let ctrSource: CtrSource = "default_curve";

  if (gscContext) {
    try {
      const siteRows = await fetchGscSiteCurveRows(gscContext, 90);
      if (siteRows.length >= 50) {
        siteCurveData = siteRows.map((row) => ({
          position: row.position,
          ctr: row.ctr,
          impressions: row.impressions,
        }));
        ctrSource = "gsc_site_curve";
      }
    } catch {
      siteCurveData = null;
    }
  }

  const identityCount = await prisma.identity.count({ where: { active: true } });

  const intensity = calculateCampaignIntensity({
    queries: queries.map((q) => ({
      text: q.text,
      type: q.type ?? "core",
      weight: q.weight ?? 0,
      monthlySearchVolume: q.monthlySearchVolume,
      startingPosition: q.startingPosition,
      gscImpressions28d: q.gscImpressions28d,
      gscClicks28d: q.gscClicks28d,
    })),
    trafficModel: {
      campaignDurationDays,
      treatmentIntensity,
      maxShareOfSearchDemand: 0.02,
      maxShareOfGscImpressions: 0.05,
      ctrSource,
      desktopPercent: 65,
    },
    siteCurveData,
    activeIdentityCount: identityCount,
  });

  const normalized = normalizeQueryWeights(intensity.queries);
  const intensityByQuery = new Map(normalized.map((row) => [row.query.toLowerCase(), row]));

  const finalQueries: CampaignQueryInput[] = queries.map((query) => {
    const calc = intensityByQuery.get(query.text.toLowerCase());
    return {
      ...query,
      weight: calc?.weight ?? query.weight,
      startingPosition: calc?.startingPosition ?? query.startingPosition,
      gscImpressions28d: calc?.gscImpressions28d ?? query.gscImpressions28d,
      gscClicks28d: calc?.gscClicks28d ?? query.gscClicks28d,
    };
  });

  const rationales: SettingRationale[] = [];

  if (gscStatus === "live") {
    rationales.push({
      setting: "Data source",
      value: "Google Search Console (28 days, AU)",
      reason: `Found ${gscRows.length} queries for this URL with ${totalImpressions.toLocaleString()} total impressions.`,
    });
  } else {
    rationales.push({
      setting: "Data source",
      value: "Keyword variations only",
      reason: gscContext
        ? "GSC is configured but returned no AU data for this URL — check the URL matches Search Console exactly."
        : "No GSC account or property selected. Connect an account in GSC settings and pick a property.",
    });
  }

  rationales.push({
    setting: "Average position",
    value: weightedPosition.toFixed(1),
    reason:
      totalImpressions > 0
        ? "Impression-weighted average from GSC for this page."
        : "No GSC impressions found; assumed position 25 for planning.",
  });

  rationales.push({
    setting: "Campaign duration",
    value: `${campaignDurationDays} days`,
    reason:
      totalImpressions < 400
        ? "Low current exposure — longer window to accumulate meaningful treatment signal."
        : "Standard 14-day treatment window based on current GSC impression volume.",
  });

  rationales.push({
    setting: "Treatment intensity",
    value: intensityLabel(treatmentIntensity),
    reason:
      weightedPosition >= 22
        ? "Deep rankings need stronger uplift to produce a measurable treatment vs baseline."
        : weightedPosition >= 12
          ? "Mid-page visibility supports a moderate treatment multiplier above expected organic clicks."
          : "Page already has reasonable visibility — lighter uplift avoids overshooting natural demand.",
  });

  rationales.push({
    setting: "Adaptive pacing",
    value: "Enabled, recalculate every 3 days",
    reason:
      "Session budget adjusts as GSC position and impressions change during the campaign.",
  });

  rationales.push({
    setting: "CTR model",
    value: ctrSource === "gsc_site_curve" ? "Your site's GSC curve" : "Default industry curve",
    reason:
      ctrSource === "gsc_site_curve"
        ? "Enough site-wide GSC history to use your property's actual click-through rates by position."
        : "Insufficient site-wide GSC data — using generic position-based CTR estimates.",
  });

  rationales.push({
    setting: "Query cluster",
    value: `${finalQueries.length} queries`,
    reason:
      gscStatus === "live"
        ? "Merged live GSC queries for this URL with keyword variations. Session weights follow allocated treatment per query."
        : "Generated from your keyword and region until GSC data is available.",
  });

  rationales.push({
    setting: "Planned sessions",
    value: String(intensity.totalAllocatedSessions),
    reason: `Based on GSC baseline clicks × ${intensity.treatmentMultiplier}× treatment, capped at 2% of search demand and 5% of page impressions.`,
  });

  if (intensity.identityDeficit && intensity.identityDeficit > 0) {
    rationales.push({
      setting: "Identities",
      value: `Need ${intensity.identityDeficit} more`,
      reason: `${intensity.activeIdentityCount} active identities can schedule ~${intensity.feasibleSessions} sessions with reuse, but organic traffic needs ~${intensity.suggestedIdentities} mostly-unique visitors (max 2 sessions each).`,
    });
  }

  return {
    keyword,
    targetUrl,
    region,
    campaignDurationDays,
    treatmentIntensity,
    adaptivePacing: true,
    recalculateEveryDays: 3,
    maxShareOfSearchDemand: 0.02,
    maxShareOfGscImpressions: 0.05,
    desktopPercent: 65,
    ctrSource,
    queries: finalQueries,
    intensity,
    rationales,
    gscStatus,
    gscQueryCount: gscRows.length,
  };
}

export function siteCurveFromGscRows(
  rows: Array<{ position: number; ctr: number; impressions: number }>,
) {
  return buildGscSiteCurve(rows);
}
