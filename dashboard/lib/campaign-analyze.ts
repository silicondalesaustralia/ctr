export interface SettingRationale {
  setting: string;
  value: string;
  reason: string;
}

export interface AnalyzeInput {
  keyword: string;
  targetUrl: string;
  region: string;
}

interface GeneratedQuery {
  text: string;
  type: string;
  weight: number;
}

interface IntensityPreview {
  queries: Array<{
    query: string;
    type: string;
    weight: number;
    monthlySearchVolume: number | null;
    startingPosition: number | null;
    gscImpressions28d: number | null;
    gscClicks28d: number | null;
    allocatedSessions: number;
  }>;
  totalBaselineClicks: number;
  totalAllocatedSessions: number;
  suggestedIdentities: number;
  activeIdentityCount: number | null;
  identityDeficit: number | null;
  feasibleSessions: number | null;
  treatmentMultiplier: number;
}

export interface CampaignProposalResponse {
  keyword: string;
  targetUrl: string;
  region: string;
  campaignDurationDays: number;
  treatmentIntensity: string;
  adaptivePacing: boolean;
  recalculateEveryDays: number;
  maxShareOfSearchDemand: number;
  maxShareOfGscImpressions: number;
  desktopPercent: number;
  ctrSource: string;
  queries: Array<{
    text: string;
    type: string;
    weight: number;
    monthlySearchVolume: number | null;
    startingPosition: number | null;
    gscImpressions28d: number | null;
    gscClicks28d: number | null;
  }>;
  intensity: IntensityPreview;
  rationales: SettingRationale[];
  gscStatus: "live" | "unavailable";
  gscQueryCount: number;
}

function recommendIntensity(avgPosition: number): string {
  if (avgPosition >= 22) return "strong";
  if (avgPosition >= 12) return "normal";
  return "low";
}

function recommendDuration(): number {
  return 21;
}

function intensityLabel(intensity: string): string {
  if (intensity === "strong") return "Strong (2× baseline)";
  if (intensity === "low") return "Low (1.25× baseline)";
  return "Normal (1.5× baseline)";
}

function buildRationales(
  input: AnalyzeInput,
  treatmentIntensity: string,
  intensity: IntensityPreview,
  queryCount: number,
): SettingRationale[] {
  const rationales: SettingRationale[] = [
    {
      setting: "Data source",
      value: "Keyword variations only",
      reason:
        "GSC analyze is unavailable on the API service right now — using keyword variations until Railway redeploys the latest API.",
    },
    {
      setting: "Average position",
      value: "25.0",
      reason: "No GSC impressions found; assumed position 25 for planning.",
    },
    {
      setting: "Campaign duration",
      value: `${recommendDuration()} days`,
      reason: "Low current exposure — longer window to accumulate meaningful treatment signal.",
    },
    {
      setting: "Treatment intensity",
      value: intensityLabel(treatmentIntensity),
      reason:
        treatmentIntensity === "strong"
          ? "Deep rankings need stronger uplift to produce a measurable treatment vs baseline."
          : treatmentIntensity === "normal"
            ? "Mid-page visibility supports a moderate treatment multiplier above expected organic clicks."
            : "Page already has reasonable visibility — lighter uplift avoids overshooting natural demand.",
    },
    {
      setting: "Adaptive pacing",
      value: "Enabled, recalculate every 3 days",
      reason: "Session budget adjusts as GSC position and impressions change during the campaign.",
    },
    {
      setting: "CTR model",
      value: "Default industry curve",
      reason: "Insufficient site-wide GSC data — using generic position-based CTR estimates.",
    },
    {
      setting: "Query cluster",
      value: `${queryCount} queries`,
      reason: `Generated from "${input.keyword}" and region ${input.region}.`,
    },
    {
      setting: "Planned sessions",
      value: String(intensity.totalAllocatedSessions),
      reason: `Based on baseline clicks × ${intensity.treatmentMultiplier}× treatment, capped at 2% of search demand and 5% of page impressions.`,
    },
  ];

  if (intensity.identityDeficit && intensity.identityDeficit > 0) {
    rationales.push({
      setting: "Identities",
      value: `Need ${intensity.identityDeficit} more`,
      reason: `${intensity.activeIdentityCount} active identities can deliver ~${intensity.feasibleSessions} of ${intensity.totalAllocatedSessions} planned sessions.`,
    });
  }

  return rationales;
}

async function railwayFetch<T>(
  apiOrigin: string,
  apiKey: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `API error ${response.status} for ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function buildCampaignProposalViaRailway(
  apiOrigin: string,
  apiKey: string,
  input: AnalyzeInput,
): Promise<CampaignProposalResponse> {
  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();

  // Prefer native analyze when Railway has deployed it.
  const analyzeResponse = await fetch(`${apiOrigin}/campaign/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ keyword, targetUrl, region }),
    cache: "no-store",
  });

  if (analyzeResponse.ok) {
    const payload = (await analyzeResponse.json()) as { proposal: CampaignProposalResponse };
    return payload.proposal;
  }

  if (analyzeResponse.status !== 404) {
    const payload = (await analyzeResponse.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `API error ${analyzeResponse.status} for /campaign/analyze`);
  }

  const { queries } = await railwayFetch<{ queries: GeneratedQuery[] }>(
    apiOrigin,
    apiKey,
    "/experiments/preview-queries",
    { keyword, region },
  );

  const campaignDurationDays = recommendDuration();
  const treatmentIntensity = recommendIntensity(25);
  const ctrSource = "default_curve";

  const { intensity } = await railwayFetch<{ intensity: IntensityPreview }>(
    apiOrigin,
    apiKey,
    "/campaign/preview-intensity",
    {
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
      queries: queries.map((query) => ({
        text: query.text,
        type: query.type,
        weight: query.weight,
      })),
    },
  );

  const intensityByQuery = new Map(intensity.queries.map((row) => [row.query.toLowerCase(), row]));

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
    queries: queries.map((query) => {
      const calc = intensityByQuery.get(query.text.toLowerCase());
      return {
        text: query.text,
        type: query.type,
        weight: calc?.weight ?? query.weight,
        monthlySearchVolume: calc?.monthlySearchVolume ?? null,
        startingPosition: calc?.startingPosition ?? null,
        gscImpressions28d: calc?.gscImpressions28d ?? null,
        gscClicks28d: calc?.gscClicks28d ?? null,
      };
    }),
    intensity,
    rationales: buildRationales(input, treatmentIntensity, intensity, queries.length),
    gscStatus: "unavailable",
    gscQueryCount: 0,
  };
}
