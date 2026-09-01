import type { TreatmentIntensity } from "@prisma/client";
import { prisma } from "../db/client.js";
import { extractTargetDomain } from "../experiments/query-generator.js";
import type { CampaignQueryInput } from "../experiments/campaign-service.js";
import {
  calculateCampaignIntensity,
  applyIntensityPlanOverrides,
  normalizeQueryWeights,
} from "./intensity-calculator.js";
import type { CampaignProposal } from "./campaign-proposal.js";
import type { PreflightQueryResult, PreflightSummary } from "./preflight-types.js";

function globalPosition(serpPage: number, position: number): number {
  return (serpPage - 1) * 10 + position;
}

function hasGscData(query: CampaignQueryInput): boolean {
  return (query.gscImpressions28d ?? 0) > 0 || (query.gscClicks28d ?? 0) > 0;
}

function liveSerpPosition(result: PreflightQueryResult | undefined): number | null {
  if (!result?.found || result.serpPage == null || result.position == null) {
    return null;
  }
  return result.globalPosition ?? globalPosition(result.serpPage, result.position);
}

/** Position used for intensity planning — GSC when available, else live preflight. */
export function planningPosition(
  query: CampaignQueryInput,
  result: PreflightQueryResult | undefined,
): number {
  if (hasGscData(query) && query.startingPosition != null) {
    return query.startingPosition;
  }
  const live = liveSerpPosition(result);
  if (live != null) {
    return live;
  }
  return query.startingPosition ?? 30;
}

function normalizeQueryInputWeights(queries: CampaignQueryInput[]): CampaignQueryInput[] {
  const total = queries.reduce((sum, query) => sum + (query.weight ?? 0), 0);
  if (total <= 0) {
    return queries.map((query, index) => ({
      ...query,
      weight: index === 0 ? 1 : 0,
    }));
  }
  return queries.map((query) => ({
    ...query,
    weight: (query.weight ?? 0) / total,
  }));
}

function pickPrimaryKeyword(
  originalKeyword: string,
  found: Array<{ text: string; globalPosition: number }>,
): string {
  const original = found.find(
    (row) => row.text.toLowerCase() === originalKeyword.toLowerCase(),
  );
  if (original) return original.text;

  const sorted = [...found].sort((a, b) => a.globalPosition - b.globalPosition);
  return sorted[0]?.text ?? originalKeyword;
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

function buildPreflightSummary(
  previousKeyword: string,
  keyword: string,
  results: PreflightQueryResult[],
): PreflightSummary {
  const findableCount = results.filter((row) => row.found).length;
  const blocked = results.some((row) => row.status === "blocked");
  const status: PreflightSummary["status"] = blocked
    ? "blocked"
    : findableCount === 0
      ? "none_found"
      : "complete";

  return {
    status,
    testedCount: results.length,
    findableCount,
    keywordAdjusted: keyword.toLowerCase() !== previousKeyword.toLowerCase(),
    previousKeyword,
    results,
  };
}

export async function rebuildProposalAfterPreflight(
  proposal: CampaignProposal,
  preflightResults: PreflightQueryResult[],
): Promise<CampaignProposal> {
  const previousKeyword = proposal.keyword;
  const resultByQuery = new Map(
    preflightResults.map((row) => [row.query.toLowerCase(), row]),
  );

  const mergedQueries: CampaignQueryInput[] = proposal.queries.map((query) => ({
    ...query,
    active: query.active !== false,
  }));

  const findableCount = preflightResults.filter((row) => row.found).length;
  const notFoundCount = preflightResults.filter(
    (row) => !row.found && row.status === "not_found",
  ).length;

  const enabledQueries = mergedQueries.filter((query) => query.active !== false);
  const rankedFindable = enabledQueries
    .map((query) => {
      const result = resultByQuery.get(query.text.toLowerCase());
      const live = liveSerpPosition(result);
      if (live == null) return null;
      return { text: query.text, globalPosition: live };
    })
    .filter((row): row is { text: string; globalPosition: number } => row != null);

  const keyword =
    rankedFindable.length > 0
      ? pickPrimaryKeyword(previousKeyword, rankedFindable)
      : previousKeyword;
  const keywordAdjusted = keyword.toLowerCase() !== previousKeyword.toLowerCase();

  const planningInputs = normalizeQueryInputWeights(
    enabledQueries.map((query) => {
      const result = resultByQuery.get(query.text.toLowerCase());
      return {
        ...query,
        type:
          query.text.toLowerCase() === keyword.toLowerCase()
            ? "core"
            : (query.type ?? "close_variation"),
        weight: query.weight ?? 0,
        startingPosition: planningPosition(query, result),
      };
    }),
  );

  const totalImpressions = planningInputs.reduce(
    (sum, query) => sum + (query.gscImpressions28d ?? 0),
    0,
  );
  const weightedPosition =
    planningInputs.length > 0
      ? totalImpressions > 0
        ? planningInputs.reduce(
            (sum, query) =>
              sum + (query.startingPosition ?? 30) * (query.gscImpressions28d ?? 0),
            0,
          ) / totalImpressions
        : planningInputs.reduce((sum, query) => sum + (query.startingPosition ?? 30), 0) /
          planningInputs.length
      : 30;

  const campaignDurationDays = proposal.campaignDurationDays ?? recommendDuration(totalImpressions);
  const treatmentIntensity =
    proposal.treatmentIntensity ?? recommendIntensity(weightedPosition);

  const identityCount = await prisma.identity.count({ where: { active: true } });

  const baseIntensity =
    planningInputs.length > 0
      ? calculateCampaignIntensity({
          queries: planningInputs.map((q) => ({
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
            maxShareOfSearchDemand: proposal.maxShareOfSearchDemand,
            maxShareOfGscImpressions: proposal.maxShareOfGscImpressions,
            ctrSource: proposal.ctrSource,
            desktopPercent: proposal.desktopPercent,
          },
          siteCurveData: null,
          activeIdentityCount: identityCount,
        })
      : {
          ...proposal.intensity,
          queries: [],
          totalBaselineClicks: 0,
          totalTreatmentSessions: 0,
          totalAllocatedSessions: 0,
          suggestedIdentities: 0,
          identityDeficit: null,
          feasibleSessions: 0,
        };

  const intensity = applyIntensityPlanOverrides(baseIntensity, {
    plannedSessionCap: proposal.plannedSessionCap,
    targetIdentityCount: proposal.targetIdentityCount,
    organicMaxSessionsPerIdentity: proposal.organicMaxSessionsPerIdentity,
    activeIdentityCount: identityCount,
    campaignDays: campaignDurationDays,
  });

  const normalized = normalizeQueryWeights(intensity.queries);
  const intensityByQuery = new Map(normalized.map((row) => [row.query.toLowerCase(), row]));

  const finalQueries: CampaignQueryInput[] = mergedQueries.map((query) => {
    const calc = intensityByQuery.get(query.text.toLowerCase());
    const original = proposal.queries.find(
      (row) => row.text.toLowerCase() === query.text.toLowerCase(),
    );
    return {
      ...query,
      weight: calc?.weight ?? query.weight,
      startingPosition: original?.startingPosition ?? query.startingPosition,
      gscImpressions28d: query.gscImpressions28d,
      gscClicks28d: query.gscClicks28d,
    };
  });

  const rationales: CampaignProposal["rationales"] = [
    {
      setting: "Google preflight",
      value: `${findableCount} of ${preflightResults.length} findable live`,
      reason:
        notFoundCount > 0
          ? `${notFoundCount} queries were not found within 3 pages — disable them in the table if you do not want them scheduled. GSC data is unchanged.`
          : "Every tested query showed your site within 3 SERP pages on live Google.",
    },
  ];

  if (keywordAdjusted) {
    rationales.push({
      setting: "Primary keyword",
      value: keyword,
      reason: `"${previousKeyword}" was not findable live — suggested best-ranked enabled query as primary.`,
    });
  }

  rationales.push({
    setting: "Average position",
    value: weightedPosition.toFixed(1),
    reason:
      totalImpressions > 0
        ? "Planning average uses GSC positions where available, live Google elsewhere (enabled queries only)."
        : "Planning average from live Google ranks for enabled queries without GSC history.",
  });

  rationales.push({
    setting: "Campaign duration",
    value: `${campaignDurationDays} days`,
    reason:
      totalImpressions < 400
        ? "Low GSC exposure — longer window for meaningful signal."
        : "Standard treatment window based on GSC impression volume.",
  });

  rationales.push({
    setting: "Treatment intensity",
    value: intensityLabel(treatmentIntensity),
    reason:
      weightedPosition >= 22
        ? "Deep rankings need stronger uplift to produce a measurable treatment vs baseline."
        : weightedPosition >= 12
          ? "Mid-page visibility supports a moderate treatment multiplier."
          : "Stronger SERP visibility supports a lighter uplift multiplier.",
  });

  rationales.push({
    setting: "Query cluster",
    value: `${finalQueries.length} queries (${enabledQueries.length} enabled)`,
    reason:
      "All analyzed queries are kept. Disable rows you do not want in the campaign; sessions use enabled queries only.",
  });

  rationales.push({
    setting: "Planned sessions",
    value: String(intensity.totalAllocatedSessions),
    reason: `Recalculated from ${enabledQueries.length} enabled queries × ${intensity.treatmentMultiplier}× treatment.`,
  });

  if (intensity.identityDeficit && intensity.identityDeficit > 0) {
    rationales.push({
      setting: "Identities",
      value: `Need ${intensity.identityDeficit} more`,
      reason: `${intensity.activeIdentityCount} active identities can schedule ~${intensity.feasibleSessions} sessions with reuse, but organic traffic needs ~${intensity.suggestedIdentities} mostly-unique visitors (max 2 sessions each).`,
    });
  }

  return {
    ...proposal,
    keyword,
    campaignDurationDays,
    treatmentIntensity,
    queries: finalQueries,
    intensity,
    rationales,
    preflight: buildPreflightSummary(previousKeyword, keyword, preflightResults),
  };
}

export interface RunKeywordPreflightInput {
  proposal: CampaignProposal;
  maxSerpPages?: number;
  identityExternalId?: string;
}

export async function runKeywordPreflight(
  input: RunKeywordPreflightInput,
  runSerpChecks: (
    queries: string[],
    context: {
      targetUrl: string;
      targetDomain: string;
      region: string;
      maxSerpPages: number;
      identityExternalId?: string;
      campaignKind?: "url" | "gmb";
      focusCity?: string | null;
      gmbBusinessName?: string | null;
      gmbPlaceId?: string | null;
    },
  ) => Promise<PreflightQueryResult[]>,
): Promise<CampaignProposal> {
  const queries = input.proposal.queries.map((q) => q.text);
  if (queries.length === 0) {
    throw new Error("No queries to validate — run analyze first.");
  }

  const isGmb = input.proposal.campaignKind === "gmb";
  let targetDomain = "gmb";
  if (!isGmb) {
    targetDomain = extractTargetDomain(input.proposal.targetUrl);
  } else if (input.proposal.gmbPlaceId) {
    targetDomain = `gmb:${input.proposal.gmbPlaceId}`;
  }
  const maxSerpPages = isGmb ? 1 : (input.maxSerpPages ?? 3);

  const results = await runSerpChecks(queries, {
    targetUrl: input.proposal.targetUrl,
    targetDomain,
    region: input.proposal.region,
    maxSerpPages,
    identityExternalId: input.identityExternalId,
    campaignKind: input.proposal.campaignKind,
    focusCity: input.proposal.focusCity,
    gmbBusinessName: input.proposal.gmbBusinessName,
    gmbPlaceId: input.proposal.gmbPlaceId,
  });

  return await rebuildProposalAfterPreflight(input.proposal, results);
}
