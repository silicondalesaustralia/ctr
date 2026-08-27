import type { CtrSource, Experiment, ExperimentQuery, Session, TreatmentIntensity } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  buildSiteCurveFromExperiment,
  fetchGscMetricsForExperiment,
  matchGscMetrics,
} from "../campaign/gsc-demand.js";
import {
  applyIntensityPlanOverrides,
  calculateCampaignIntensity,
  normalizeQueryWeights,
} from "../campaign/intensity-calculator.js";
import type { CampaignIntensityResult } from "../campaign/types.js";
import { generateCampaignSchedule } from "../scheduler/schedule-generator.js";
import {
  buildExperimentName,
  extractTargetDomain,
  generateQueryCluster,
  resolveRegionTimezone,
} from "./query-generator.js";
import { createExperimentFromInput, type CreateExperimentInput } from "./experiment-service.js";
import { assignMissingPersonas, createAdditionalIdentities } from "../identities/identity-service.js";

export type CampaignWithQueries = Experiment & { queries: ExperimentQuery[] };

export interface CampaignQueryInput {
  text: string;
  type?: string;
  weight?: number;
  monthlySearchVolume?: number | null;
  startingPosition?: number | null;
  gscImpressions28d?: number | null;
  gscClicks28d?: number | null;
  active?: boolean;
}

export interface UpsertCampaignInput extends CreateExperimentInput {
  campaignDurationDays?: number;
  treatmentIntensity?: TreatmentIntensity;
  adaptivePacing?: boolean;
  recalculateEveryDays?: number;
  maxShareOfSearchDemand?: number;
  maxShareOfGscImpressions?: number;
  desktopPercent?: number;
  ctrSource?: CtrSource;
  gscConnectionId?: string | null;
  gscSiteUrl?: string | null;
  queries?: CampaignQueryInput[];
  plannedSessionCap?: number | null;
  targetIdentityCount?: number | null;
  organicMaxSessionsPerIdentity?: number;
}

export async function getCurrentCampaign(): Promise<CampaignWithQueries | null> {
  const active = await prisma.experiment.findFirst({
    where: { status: { in: ["active", "paused"] } },
    include: { queries: { where: { active: true }, orderBy: { weight: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
  if (active) {
    return active;
  }

  return prisma.experiment.findFirst({
    include: { queries: { where: { active: true }, orderBy: { weight: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCampaigns(): Promise<CampaignWithQueries[]> {
  return prisma.experiment.findMany({
    include: { queries: { where: { active: true }, orderBy: { weight: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCampaignById(id: string): Promise<CampaignWithQueries | null> {
  return prisma.experiment.findUnique({
    where: { id },
    include: { queries: { orderBy: { weight: "desc" } } },
  });
}

export async function countActiveCampaigns(): Promise<number> {
  return prisma.experiment.count({ where: { status: "active" } });
}

async function enableRunner(): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: "runner_enabled" },
    update: { value: "true" },
    create: { key: "runner_enabled", value: "true" },
  });
  process.env.EXPERIMENT_RUNNER_ENABLED = "true";
}

async function disableRunnerIfNoneActive(): Promise<void> {
  const activeCount = await countActiveCampaigns();
  if (activeCount > 0) {
    return;
  }

  await prisma.appSetting.upsert({
    where: { key: "runner_enabled" },
    update: { value: "false" },
    create: { key: "runner_enabled", value: "false" },
  });
  process.env.EXPERIMENT_RUNNER_ENABLED = "false";
}

export function getCampaignKeyword(campaign: CampaignWithQueries): string {
  const core = campaign.queries.find((query) => query.queryType === "core");
  return core?.query ?? campaign.queries[0]?.query ?? "";
}

async function enrichQueriesWithGsc(
  experimentId: string | null,
  targetUrl: string,
  queries: CampaignQueryInput[],
): Promise<CampaignQueryInput[]> {
  if (!experimentId) return queries;

  const gscMap = await fetchGscMetricsForExperiment(experimentId, targetUrl);
  if (gscMap.size === 0) return queries;

  return queries.map((query) => {
    const gsc = matchGscMetrics(query.text, gscMap);
    if (!gsc) return query;

    return {
      ...query,
      startingPosition: query.startingPosition ?? gsc.position,
      gscImpressions28d: query.gscImpressions28d ?? gsc.impressions28d,
      gscClicks28d: query.gscClicks28d ?? gsc.clicks28d,
    };
  });
}

export async function previewCampaignIntensity(
  input: UpsertCampaignInput,
  experimentId?: string | null,
): Promise<CampaignIntensityResult> {
  const keyword = input.keyword.trim();
  const region = input.region.trim().toUpperCase();

  let queries: CampaignQueryInput[] =
    input.queries ??
    generateQueryCluster(keyword, region).map((q) => ({
      text: q.text,
      type: q.type,
      weight: q.weight,
    }));

  queries = queries.filter((query) => query.active !== false);

  queries = await enrichQueriesWithGsc(experimentId ?? null, input.targetUrl.trim(), queries);

  const identityCount = await prisma.identity.count({ where: { active: true } });

  const siteCurveData =
    input.ctrSource === "gsc_site_curve" && experimentId
      ? await buildSiteCurveFromExperiment(experimentId)
      : null;

  const campaignDays = input.campaignDurationDays ?? 14;
  const base = calculateCampaignIntensity({
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
      campaignDurationDays: campaignDays,
      treatmentIntensity: input.treatmentIntensity ?? "normal",
      maxShareOfSearchDemand: input.maxShareOfSearchDemand ?? 0.02,
      maxShareOfGscImpressions: input.maxShareOfGscImpressions ?? 0.05,
      ctrSource: input.ctrSource ?? "default_curve",
      desktopPercent: input.desktopPercent ?? 65,
    },
    siteCurveData,
    activeIdentityCount: identityCount,
    maxSessionsPerIdentityPerDay: 1,
    repeatIdentityMinGapDays: 2,
  });

  return applyIntensityPlanOverrides(base, {
    plannedSessionCap: input.plannedSessionCap,
    targetIdentityCount: input.targetIdentityCount,
    organicMaxSessionsPerIdentity: input.organicMaxSessionsPerIdentity,
    activeIdentityCount: identityCount,
    campaignDays,
  });
}

async function persistQueries(
  experimentId: string,
  queries: CampaignQueryInput[],
  intensity: CampaignIntensityResult,
): Promise<ExperimentQuery[]> {
  await prisma.experimentQuery.deleteMany({ where: { experimentId } });

  const normalized = normalizeQueryWeights(intensity.queries);
  const intensityByQuery = new Map(normalized.map((row) => [row.query.toLowerCase(), row]));
  const created: ExperimentQuery[] = [];

  for (const input of queries) {
    const calc = intensityByQuery.get(input.text.toLowerCase());

    const row = await prisma.experimentQuery.create({
      data: {
        experimentId,
        query: input.text,
        queryType: (input.type ?? "core") as ExperimentQuery["queryType"],
        weight: calc?.weight ?? input.weight ?? 0,
        active: input.active !== false,
        monthlySearchVolume: input.monthlySearchVolume ?? calc?.monthlySearchVolume,
        startingPosition: input.startingPosition ?? calc?.startingPosition,
        gscImpressions28d: input.gscImpressions28d ?? calc?.gscImpressions28d,
        gscClicks28d: input.gscClicks28d ?? calc?.gscClicks28d,
        allocatedSessions:
          input.active === false ? 0 : (calc?.allocatedSessions ?? 0),
      },
    });
    created.push(row);
  }

  return created;
}

async function saveCampaignConfig(
  experimentId: string,
  input: UpsertCampaignInput,
  queries: CampaignQueryInput[],
  intensity: CampaignIntensityResult,
  existing?: Experiment,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[]; intensity: CampaignIntensityResult }> {
  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();

  const experiment = await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      name: input.name?.trim() || buildExperimentName(keyword, region),
      targetUrl,
      targetDomain: extractTargetDomain(targetUrl),
      focusRegion: region === "ALL" ? null : region,
      scheduleTimezone: resolveRegionTimezone(region),
      monthlySessionTarget: intensity.totalAllocatedSessions,
      campaignDurationDays: input.campaignDurationDays ?? existing?.campaignDurationDays ?? 14,
      treatmentIntensity: input.treatmentIntensity ?? existing?.treatmentIntensity ?? "normal",
      adaptivePacing: input.adaptivePacing ?? existing?.adaptivePacing ?? true,
      recalculateEveryDays: input.recalculateEveryDays ?? existing?.recalculateEveryDays ?? 3,
      maxShareOfSearchDemand: input.maxShareOfSearchDemand ?? existing?.maxShareOfSearchDemand ?? 0.02,
      maxShareOfGscImpressions:
        input.maxShareOfGscImpressions ?? existing?.maxShareOfGscImpressions ?? 0.05,
      desktopPercent: input.desktopPercent ?? existing?.desktopPercent ?? 65,
      ctrSource: input.ctrSource ?? existing?.ctrSource ?? "default_curve",
      gscConnectionId: input.gscConnectionId ?? existing?.gscConnectionId ?? null,
      gscSiteUrl: input.gscSiteUrl ?? existing?.gscSiteUrl ?? null,
    },
  });

  const persistedQueries = await persistQueries(experiment.id, queries, intensity);
  return { experiment, queries: persistedQueries, intensity };
}

export async function createCampaign(
  input: UpsertCampaignInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[]; intensity: CampaignIntensityResult }> {
  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();

  let queries: CampaignQueryInput[] =
    input.queries ??
    generateQueryCluster(keyword, region).map((q) => ({
      text: q.text,
      type: q.type,
      weight: q.weight,
    }));

  queries = await enrichQueriesWithGsc(null, targetUrl, queries);
  const intensity = await previewCampaignIntensity({ ...input, queries }, null);

  const created = await createExperimentFromInput({
    ...input,
    activate: false,
    sessionsPerMonth: intensity.totalAllocatedSessions,
  });

  return saveCampaignConfig(created.experiment.id, input, queries, intensity);
}

export async function updateCampaign(
  experimentId: string,
  input: UpsertCampaignInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[]; intensity: CampaignIntensityResult }> {
  const existing = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();

  let queries: CampaignQueryInput[] =
    input.queries ??
    generateQueryCluster(keyword, region).map((q) => ({
      text: q.text,
      type: q.type,
      weight: q.weight,
    }));

  queries = await enrichQueriesWithGsc(experimentId, targetUrl, queries);
  const intensity = await previewCampaignIntensity(input, experimentId);

  return saveCampaignConfig(experimentId, input, queries, intensity, existing);
}

export async function upsertCampaign(
  input: UpsertCampaignInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[]; intensity: CampaignIntensityResult }> {
  const current = await getCurrentCampaign();
  if (!current) {
    return createCampaign(input);
  }
  return updateCampaign(current.id, input);
}

export async function runCampaign(experimentId: string): Promise<CampaignWithQueries> {
  const existing = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + existing.campaignDurationDays);

  await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      status: "active",
      startDate,
      endDate,
    },
  });

  await enableRunner();

  const scheduledCount = await prisma.scheduledSession.count({
    where: { experimentId, status: "scheduled" },
  });

  if (scheduledCount === 0) {
    const identities = await prisma.identity.findMany({ where: { active: true } });
    const fresh = await prisma.experiment.findUniqueOrThrow({
      where: { id: experimentId },
      include: { queries: { where: { active: true } } },
    });

    await generateCampaignSchedule({
      experiment: fresh,
      queries: fresh.queries,
      identities,
      totalSessions: fresh.monthlySessionTarget,
      startDate,
      durationDays: fresh.campaignDurationDays,
    });
  }

  return prisma.experiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: { queries: { where: { active: true } } },
  });
}

export async function stopCampaign(experimentId: string): Promise<CampaignWithQueries> {
  const experiment = await prisma.experiment.update({
    where: { id: experimentId },
    data: { status: "paused" },
    include: { queries: { where: { active: true } } },
  });

  await prisma.scheduledSession.updateMany({
    where: { experimentId, status: "scheduled" },
    data: { status: "cancelled" },
  });

  await disableRunnerIfNoneActive();

  return experiment;
}

export async function deleteCampaign(experimentId: string): Promise<void> {
  const existing = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!existing) {
    throw new Error("Campaign not found");
  }

  if (existing.status === "active") {
    await stopCampaign(experimentId);
  }

  await prisma.session.deleteMany({ where: { experimentId } });
  await prisma.experiment.delete({ where: { id: experimentId } });
}

export async function createIdentitiesForCampaign(
  input: UpsertCampaignInput,
  options?: { count?: number; experimentId?: string | null },
): Promise<{
  createdCount: number;
  fromExternalId: string | null;
  toExternalId: string | null;
  intensity: CampaignIntensityResult;
  personasAssigned?: number;
}> {
  const experimentId =
    options?.experimentId ??
    (await getCurrentCampaign())?.id ??
    null;
  const intensity = await previewCampaignIntensity(input, experimentId);
  const deficit = intensity.identityDeficit ?? 0;
  const toCreate = options?.count ?? deficit;

  if (toCreate <= 0) {
    const backfilled = await assignMissingPersonas();
    return {
      createdCount: 0,
      fromExternalId: null,
      toExternalId: null,
      intensity,
      personasAssigned: backfilled,
    };
  }

  const campaign = experimentId
    ? await prisma.experiment.findUnique({ where: { id: experimentId } })
    : null;

  const result = await createAdditionalIdentities({
    count: toCreate,
    desktopPercent: input.desktopPercent ?? campaign?.desktopPercent ?? 65,
  });

  await assignMissingPersonas();

  const refreshed = await previewCampaignIntensity(input, experimentId);

  return {
    createdCount: result.created.length,
    fromExternalId: result.fromExternalId,
    toExternalId: result.toExternalId,
    intensity: refreshed,
  };
}

export async function getCampaignLog(experimentId: string, limit = 100) {
  return prisma.session.findMany({
    where: { experimentId },
    include: {
      identity: {
        select: { externalId: true, region: true, deviceClass: true, personaId: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export interface CampaignIdentityRow {
  id: string;
  externalId: string;
  region: string;
  city: string;
  deviceClass: string;
  personaId: string | null;
  active: boolean;
  campaignSessions: number;
  campaignClicks: number;
  campaignBlocked: number;
  lastUsedForCampaign: string | null;
  inRegionPool: boolean;
}

export async function getCampaignIdentities(experimentId: string): Promise<CampaignIdentityRow[]> {
  await assignMissingPersonas();

  const campaign = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const sessions = await prisma.session.findMany({
    where: { experimentId },
    select: {
      identityId: true,
      status: true,
      targetClicked: true,
      createdAt: true,
    },
  });

  const usage = new Map<
    string,
    { sessions: number; clicks: number; blocked: number; lastUsed: Date | null }
  >();

  for (const session of sessions) {
    const row = usage.get(session.identityId) ?? {
      sessions: 0,
      clicks: 0,
      blocked: 0,
      lastUsed: null,
    };
    row.sessions += 1;
    if (session.targetClicked) row.clicks += 1;
    if (session.status === "blocked") row.blocked += 1;
    if (!row.lastUsed || session.createdAt > row.lastUsed) {
      row.lastUsed = session.createdAt;
    }
    usage.set(session.identityId, row);
  }

  const identities = await prisma.identity.findMany({ orderBy: { externalId: "asc" } });
  const focusRegion = campaign.focusRegion;

  return identities
    .map((identity) => {
      const stats = usage.get(identity.id);
      const inRegionPool = !focusRegion || identity.region === focusRegion;
      const usedInCampaign = stats != null;
      return {
        id: identity.id,
        externalId: identity.externalId,
        region: identity.region,
        city: identity.city,
        deviceClass: identity.deviceClass,
        personaId: identity.personaId,
        active: identity.active,
        campaignSessions: stats?.sessions ?? 0,
        campaignClicks: stats?.clicks ?? 0,
        campaignBlocked: stats?.blocked ?? 0,
        lastUsedForCampaign: stats?.lastUsed?.toISOString() ?? null,
        inRegionPool,
        usedInCampaign,
      };
    })
    .filter((row) => row.usedInCampaign || row.inRegionPool)
    .map(({ usedInCampaign: _used, ...row }) => row);
}

export async function serializeCampaignSummary(campaign: CampaignWithQueries) {
  const [completedSessions, scheduledSessions] = await Promise.all([
    prisma.session.count({ where: { experimentId: campaign.id } }),
    prisma.scheduledSession.count({
      where: { experimentId: campaign.id, status: "scheduled" },
    }),
  ]);

  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    keyword: getCampaignKeyword(campaign),
    targetUrl: campaign.targetUrl,
    region: campaign.focusRegion ?? "ALL",
    campaignDurationDays: campaign.campaignDurationDays,
    monthlySessionTarget: campaign.monthlySessionTarget,
    queryCount: campaign.queries.length,
    completedSessions,
    scheduledSessions,
    updatedAt: campaign.updatedAt.toISOString(),
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
  };
}

export function serializeCampaign(
  campaign: CampaignWithQueries,
  intensity?: CampaignIntensityResult | null,
) {
  return {
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    status: campaign.status,
    keyword: getCampaignKeyword(campaign),
    targetUrl: campaign.targetUrl,
    targetDomain: campaign.targetDomain,
    region: campaign.focusRegion ?? "ALL",
    country: campaign.country,
    monthlySessionTarget: campaign.monthlySessionTarget,
    campaignDurationDays: campaign.campaignDurationDays,
    treatmentIntensity: campaign.treatmentIntensity,
    adaptivePacing: campaign.adaptivePacing,
    recalculateEveryDays: campaign.recalculateEveryDays,
    maxShareOfSearchDemand: campaign.maxShareOfSearchDemand,
    maxShareOfGscImpressions: campaign.maxShareOfGscImpressions,
    desktopPercent: campaign.desktopPercent,
    ctrSource: campaign.ctrSource,
    gscConnectionId: campaign.gscConnectionId,
    gscSiteUrl: campaign.gscSiteUrl,
    lastPacingRecalcAt: campaign.lastPacingRecalcAt?.toISOString() ?? null,
    queries: campaign.queries.map((query) => ({
      text: query.query,
      type: query.queryType,
      weight: query.weight,
      active: query.active,
      monthlySearchVolume: query.monthlySearchVolume,
      startingPosition: query.startingPosition,
      gscImpressions28d: query.gscImpressions28d,
      gscClicks28d: query.gscClicks28d,
      allocatedSessions: query.allocatedSessions,
    })),
    intensity: intensity
      ? {
          totalBaselineClicks: intensity.totalBaselineClicks,
          totalAllocatedSessions: intensity.totalAllocatedSessions,
          suggestedIdentities: intensity.suggestedIdentities,
          activeIdentityCount: intensity.activeIdentityCount,
          identityDeficit: intensity.identityDeficit,
          feasibleSessions: intensity.feasibleSessions,
          treatmentMultiplier: intensity.treatmentMultiplier,
        }
      : null,
  };
}

export function serializeLogEntry(
  session: Session & {
    identity: { externalId: string; region: string; deviceClass: string; personaId: string | null };
  },
) {
  let queriesUsed: string[] = [];
  if (session.queriesUsedJson) {
    try {
      queriesUsed = JSON.parse(session.queriesUsedJson) as string[];
    } catch {
      queriesUsed = [];
    }
  }

  return {
    id: session.id,
    time: session.createdAt.toISOString(),
    query: session.queryText,
    queriesUsed,
    searchAttempts: session.searchAttempts,
    status: session.status,
    serpPosition: session.observedPosition,
    serpPage: session.serpPage,
    clicked: session.targetClicked ?? false,
    skipped: session.targetSkipped,
    landingUrl: session.landingUrl,
    region: session.identity.region,
    identity: session.identity.externalId,
    device: session.identity.deviceClass,
    persona: session.personaId ?? session.identity.personaId,
    durationSeconds: session.durationSeconds,
    pageviews: session.pageviews,
    internalClicks: session.internalClicks,
    scrollDepth: session.scrollDepth,
  };
}
