import type { TreatmentIntensity } from "@prisma/client";
import { prisma } from "../db/client.js";
import { extractTargetDomain } from "../experiments/query-generator.js";
import type { CampaignQueryInput } from "../experiments/campaign-service.js";
import { calculateCampaignIntensity, normalizeQueryWeights } from "./intensity-calculator.js";
import type { CampaignProposal } from "./campaign-proposal.js";
import type { PreflightQueryResult, PreflightSummary } from "./preflight-types.js";

function globalPosition(serpPage: number, position: number): number {
  return (serpPage - 1) * 10 + position;
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

  const foundQueries: CampaignQueryInput[] = [];
  for (const query of proposal.queries) {
    const result = resultByQuery.get(query.text.toLowerCase());
    if (!result?.found || result.serpPage == null || result.position == null) {
      continue;
    }

    foundQueries.push({
      ...query,
      startingPosition: result.globalPosition ?? globalPosition(result.serpPage, result.position),
      type:
        query.text.toLowerCase() === previousKeyword.toLowerCase()
          ? "core"
          : query.type ?? "close_variation",
    });
  }

  if (foundQueries.length === 0) {
    const rationales = [
      ...proposal.rationales.filter((row) => row.setting !== "Query cluster"),
      {
        setting: "Google preflight",
        value: "No findable queries",
        reason:
          "None of the tested queries returned your site in the first 3 SERP pages. Fix rankings or keywords before starting treatment.",
      },
      {
        setting: "Query cluster",
        value: "0 queries",
        reason: "All generated variations were not findable on Google within 3 pages.",
      },
      {
        setting: "Planned sessions",
        value: "0",
        reason: "No findable queries — campaign cannot run search treatment sessions.",
      },
    ];

    return {
      ...proposal,
      queries: [],
      intensity: {
        ...proposal.intensity,
        queries: [],
        totalBaselineClicks: 0,
        totalTreatmentSessions: 0,
        totalAllocatedSessions: 0,
        suggestedIdentities: 0,
        identityDeficit: null,
        feasibleSessions: 0,
      },
      rationales,
      preflight: buildPreflightSummary(previousKeyword, previousKeyword, preflightResults),
    };
  }

  const rankedFound = foundQueries.map((query) => {
    const result = resultByQuery.get(query.text.toLowerCase())!;
    return {
      text: query.text,
      globalPosition:
        result.globalPosition ??
        globalPosition(result.serpPage!, result.position!),
    };
  });

  const keyword = pickPrimaryKeyword(previousKeyword, rankedFound);
  const keywordAdjusted = keyword.toLowerCase() !== previousKeyword.toLowerCase();

  const normalizedInputs = normalizeQueryInputWeights(
    foundQueries.map((query) => ({
      ...query,
      type:
        query.text.toLowerCase() === keyword.toLowerCase()
          ? "core"
          : (query.type ?? "close_variation"),
      weight: query.weight ?? 0,
    })),
  );

  const totalImpressions = normalizedInputs.reduce(
    (sum, query) => sum + (query.gscImpressions28d ?? 0),
    0,
  );
  const weightedPosition =
    totalImpressions > 0
      ? normalizedInputs.reduce(
          (sum, query) =>
            sum + (query.startingPosition ?? 30) * (query.gscImpressions28d ?? 0),
          0,
        ) / totalImpressions
      : rankedFound.reduce((sum, row) => sum + row.globalPosition, 0) / rankedFound.length;

  const campaignDurationDays = recommendDuration(totalImpressions);
  const treatmentIntensity = recommendIntensity(weightedPosition);

  const identityCount = await prisma.identity.count({ where: { active: true } });

  const intensity = calculateCampaignIntensity({
    queries: normalizedInputs.map((q) => ({
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
  });

  const normalized = normalizeQueryWeights(intensity.queries);
  const intensityByQuery = new Map(normalized.map((row) => [row.query.toLowerCase(), row]));

  const finalQueries: CampaignQueryInput[] = normalizedInputs.map((query) => {
    const calc = intensityByQuery.get(query.text.toLowerCase());
    return {
      ...query,
      weight: calc?.weight ?? query.weight,
      startingPosition: calc?.startingPosition ?? query.startingPosition,
      gscImpressions28d: calc?.gscImpressions28d ?? query.gscImpressions28d,
      gscClicks28d: calc?.gscClicks28d ?? query.gscClicks28d,
    };
  });

  const removedCount = proposal.queries.length - finalQueries.length;
  const rationales: CampaignProposal["rationales"] = [
    {
      setting: "Google preflight",
      value: `${finalQueries.length} of ${proposal.queries.length} findable`,
      reason:
        removedCount > 0
          ? `Removed ${removedCount} queries that did not show your site within 3 SERP pages.`
          : "Every tested query showed your site within 3 SERP pages.",
    },
  ];

  if (keywordAdjusted) {
    rationales.push({
      setting: "Primary keyword",
      value: keyword,
      reason: `"${previousKeyword}" was not findable — using the best-ranked query from preflight instead.`,
    });
  }

  rationales.push({
    setting: "Average position",
    value: weightedPosition.toFixed(1),
    reason: keywordAdjusted
      ? "Based on live SERP positions from preflight (not GSC estimates)."
      : totalImpressions > 0
        ? "Blended GSC and live SERP positions for findable queries."
        : "Based on live SERP positions from preflight.",
  });

  rationales.push({
    setting: "Campaign duration",
    value: `${campaignDurationDays} days`,
    reason:
      totalImpressions < 400
        ? "Low exposure — longer window, recalculated after preflight query filter."
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
    value: `${finalQueries.length} queries`,
    reason: "Only queries that passed Google preflight (site found within 3 pages).",
  });

  rationales.push({
    setting: "Planned sessions",
    value: String(intensity.totalAllocatedSessions),
    reason: `Recalculated from ${finalQueries.length} findable queries × ${intensity.treatmentMultiplier}× treatment.`,
  });

  if (intensity.identityDeficit && intensity.identityDeficit > 0) {
    rationales.push({
      setting: "Identities",
      value: `Need ${intensity.identityDeficit} more`,
      reason: `${intensity.activeIdentityCount} active identities can deliver ~${intensity.feasibleSessions} of ${intensity.totalAllocatedSessions} planned sessions.`,
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
    },
  ) => Promise<PreflightQueryResult[]>,
): Promise<CampaignProposal> {
  const queries = input.proposal.queries.map((q) => q.text);
  if (queries.length === 0) {
    throw new Error("No queries to validate — run analyze first.");
  }

  const targetDomain = extractTargetDomain(input.proposal.targetUrl);
  const maxSerpPages = input.maxSerpPages ?? 3;

  const results = await runSerpChecks(queries, {
    targetUrl: input.proposal.targetUrl,
    targetDomain,
    region: input.proposal.region,
    maxSerpPages,
    identityExternalId: input.identityExternalId,
  });

  return await rebuildProposalAfterPreflight(input.proposal, results);
}
