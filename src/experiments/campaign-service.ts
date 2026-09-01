import type { CampaignKind, CtrSource, Experiment, ExperimentQuery, Session, TreatmentIntensity } from "@prisma/client";
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
import {
  computeWarmupProgress,
  countEligibleIdentities,
  getCampaignIdentityPool,
  setCampaignIdentities,
} from "../warmup/warmup-service.js";
import { isWarmupExperiment } from "../warmup/warmup-experiment.js";
import { findRegionByCity } from "../campaign/geo-capacity.js";
import { parseGmbTarget } from "../campaign/gmb-target.js";
import {
  actionsFromFlags,
  flagsFromActions,
  parseActionsJson,
  serializeActions,
  type GmbAction,
  type GmbActionFlags,
} from "../campaign/gmb-types.js";

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
  campaignKind?: CampaignKind | "url" | "gmb";
  focusCity?: string | null;
  gmbBusinessName?: string | null;
  gmbPlaceId?: string | null;
  gmbMapsUrl?: string | null;
  gmbActions?: GmbActionFlags | GmbAction[] | string[] | null;
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
  selectedIdentityIds?: string[];
}

function resolveGmbFields(input: UpsertCampaignInput): {
  campaignKind: CampaignKind;
  focusCity: string | null;
  region: string;
  targetUrl: string;
  targetDomain: string;
  gmbBusinessName: string | null;
  gmbPlaceId: string | null;
  gmbMapsUrl: string | null;
  gmbActionsJson: string | null;
} {
  const kind = (input.campaignKind ?? "url") as CampaignKind;
  if (kind !== "gmb") {
    const targetUrl = input.targetUrl.trim();
    return {
      campaignKind: "url",
      focusCity: input.focusCity?.trim() || null,
      region: input.region.trim().toUpperCase(),
      targetUrl,
      targetDomain: extractTargetDomain(targetUrl),
      gmbBusinessName: null,
      gmbPlaceId: null,
      gmbMapsUrl: null,
      gmbActionsJson: null,
    };
  }

  const cityConfig = findRegionByCity(input.focusCity ?? "");
  if (!cityConfig) {
    throw new Error("GMB campaigns require a geo city (e.g. Adelaide)");
  }
  const businessName = input.gmbBusinessName?.trim();
  if (!businessName) {
    throw new Error("GMB campaigns require a business name");
  }
  const mapsInput = (input.gmbMapsUrl ?? input.targetUrl).trim();
  const parsed = parseGmbTarget(mapsInput);
  let actionFlags: GmbActionFlags;
  if (Array.isArray(input.gmbActions)) {
    actionFlags = flagsFromActions(input.gmbActions);
  } else if (input.gmbActions && typeof input.gmbActions === "object") {
    actionFlags = input.gmbActions as GmbActionFlags;
  } else {
    actionFlags = flagsFromActions(null);
  }

  return {
    campaignKind: "gmb",
    focusCity: cityConfig.city,
    region: cityConfig.region,
    targetUrl: parsed.mapsUrl,
    targetDomain: parsed.targetDomain,
    gmbBusinessName: businessName,
    gmbPlaceId: input.gmbPlaceId?.trim() || parsed.placeId || (parsed.cid ? `cid:${parsed.cid}` : null),
    gmbMapsUrl: parsed.mapsUrl,
    gmbActionsJson: serializeActions(actionsFromFlags(actionFlags)),
  };
}

export async function getCurrentCampaign(): Promise<CampaignWithQueries | null> {
  const active = await prisma.experiment.findFirst({
    where: { status: { in: ["active", "paused"] }, slug: { not: "__warmup__" } },
    include: { queries: { where: { active: true }, orderBy: { weight: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
  if (active) {
    return active;
  }

  return prisma.experiment.findFirst({
    where: { slug: { not: "__warmup__" } },
    include: { queries: { where: { active: true }, orderBy: { weight: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function listCampaigns(): Promise<CampaignWithQueries[]> {
  const campaigns = await prisma.experiment.findMany({
    include: { queries: { where: { active: true }, orderBy: { weight: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return campaigns.filter((campaign) => !isWarmupExperiment(campaign.slug));
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
  const resolved = resolveGmbFields({
    ...input,
    keyword: input.keyword,
    targetUrl: input.targetUrl || input.gmbMapsUrl || "https://www.google.com/maps",
    region: input.region || "ALL",
  });
  const keyword = input.keyword.trim();
  const region = resolved.region;

  let queries: CampaignQueryInput[] =
    input.queries ??
    generateQueryCluster(keyword, region).map((q) => ({
      text: q.text,
      type: q.type,
      weight: q.weight,
    }));

  queries = queries.filter((query) => query.active !== false);

  if (resolved.campaignKind === "url") {
    queries = await enrichQueriesWithGsc(experimentId ?? null, resolved.targetUrl, queries);
  }

  const experiment = experimentId
    ? await prisma.experiment.findUnique({
        where: { id: experimentId },
        select: { requireWarmupIdentities: true },
      })
    : null;
  const requireWarmup = experiment?.requireWarmupIdentities ?? true;
  const identityCount = await countEligibleIdentities(
    region === "ALL" ? null : region,
    requireWarmup,
    resolved.focusCity,
  );

  const siteCurveData =
    resolved.campaignKind === "url" &&
    input.ctrSource === "gsc_site_curve" &&
    experimentId
      ? await buildSiteCurveFromExperiment(experimentId)
      : null;

  const campaignDays = input.campaignDurationDays ?? (resolved.campaignKind === "gmb" ? 21 : 14);
  const base = calculateCampaignIntensity({
    queries: queries.map((q) => ({
      text: q.text,
      type: q.type ?? "core",
      weight: q.weight ?? 0,
      monthlySearchVolume: q.monthlySearchVolume,
      startingPosition: q.startingPosition ?? null,
      gscImpressions28d: q.gscImpressions28d,
      gscClicks28d: q.gscClicks28d,
    })),
    trafficModel: {
      campaignDurationDays: campaignDays,
      treatmentIntensity: input.treatmentIntensity ?? "normal",
      maxShareOfSearchDemand: input.maxShareOfSearchDemand ?? 0.02,
      maxShareOfGscImpressions: input.maxShareOfGscImpressions ?? 0.05,
      ctrSource: input.ctrSource ?? "default_curve",
      desktopPercent: input.desktopPercent ?? (resolved.campaignKind === "gmb" ? 40 : 65),
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
  const resolved = resolveGmbFields({
    ...input,
    keyword,
    targetUrl: input.targetUrl || input.gmbMapsUrl || "https://www.google.com/maps",
    region: input.region || "ALL",
  });

  const experiment = await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      name: input.name?.trim() || buildExperimentName(keyword, resolved.region),
      targetUrl: resolved.targetUrl,
      targetDomain: resolved.targetDomain,
      campaignKind: resolved.campaignKind,
      focusRegion: resolved.region === "ALL" ? null : resolved.region,
      focusCity: resolved.focusCity,
      gmbBusinessName: resolved.gmbBusinessName,
      gmbPlaceId: resolved.gmbPlaceId,
      gmbMapsUrl: resolved.gmbMapsUrl,
      gmbActionsJson: resolved.gmbActionsJson,
      scheduleTimezone: resolveRegionTimezone(resolved.region),
      monthlySessionTarget: intensity.totalAllocatedSessions,
      campaignDurationDays:
        input.campaignDurationDays ??
        existing?.campaignDurationDays ??
        (resolved.campaignKind === "gmb" ? 21 : 14),
      treatmentIntensity: input.treatmentIntensity ?? existing?.treatmentIntensity ?? "normal",
      adaptivePacing: input.adaptivePacing ?? existing?.adaptivePacing ?? true,
      recalculateEveryDays: input.recalculateEveryDays ?? existing?.recalculateEveryDays ?? 3,
      maxShareOfSearchDemand: input.maxShareOfSearchDemand ?? existing?.maxShareOfSearchDemand ?? 0.02,
      maxShareOfGscImpressions:
        input.maxShareOfGscImpressions ?? existing?.maxShareOfGscImpressions ?? 0.05,
      desktopPercent:
        input.desktopPercent ??
        existing?.desktopPercent ??
        (resolved.campaignKind === "gmb" ? 40 : 65),
      ctrSource: input.ctrSource ?? existing?.ctrSource ?? "default_curve",
      gscConnectionId:
        resolved.campaignKind === "gmb"
          ? null
          : (input.gscConnectionId ?? existing?.gscConnectionId ?? null),
      gscSiteUrl:
        resolved.campaignKind === "gmb"
          ? null
          : (input.gscSiteUrl ?? existing?.gscSiteUrl ?? null),
    },
  });

  const persistedQueries = await persistQueries(experiment.id, queries, intensity);

  if (input.selectedIdentityIds) {
    await setCampaignIdentities(experiment.id, input.selectedIdentityIds);
  }

  return { experiment, queries: persistedQueries, intensity };
}

export async function createCampaign(
  input: UpsertCampaignInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[]; intensity: CampaignIntensityResult }> {
  const keyword = input.keyword.trim();
  const resolved = resolveGmbFields({
    ...input,
    keyword,
    targetUrl: input.targetUrl || input.gmbMapsUrl || "https://www.google.com/maps",
    region: input.region || "ALL",
  });

  let queries: CampaignQueryInput[] =
    input.queries ??
    generateQueryCluster(keyword, resolved.region).map((q) => ({
      text: q.text,
      type: q.type,
      weight: q.weight,
    }));

  if (resolved.campaignKind === "url") {
    queries = await enrichQueriesWithGsc(null, resolved.targetUrl, queries);
  }
  const intensity = await previewCampaignIntensity({ ...input, queries }, null);

  const created = await createExperimentFromInput({
    ...input,
    targetUrl: resolved.targetUrl,
    region: resolved.region,
    activate: false,
    sessionsPerMonth: intensity.totalAllocatedSessions,
    campaignKind: resolved.campaignKind,
    focusCity: resolved.focusCity,
    gmbBusinessName: resolved.gmbBusinessName,
    gmbPlaceId: resolved.gmbPlaceId,
    gmbMapsUrl: resolved.gmbMapsUrl,
    gmbActionsJson: resolved.gmbActionsJson,
    targetDomain: resolved.targetDomain,
  });

  return saveCampaignConfig(created.experiment.id, input, queries, intensity);
}

export async function updateCampaign(
  experimentId: string,
  input: UpsertCampaignInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[]; intensity: CampaignIntensityResult }> {
  const existing = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const keyword = input.keyword.trim();
  const resolved = resolveGmbFields({
    ...input,
    keyword,
    targetUrl: input.targetUrl || input.gmbMapsUrl || existing.targetUrl,
    region: input.region || existing.focusRegion || "ALL",
  });

  let queries: CampaignQueryInput[] =
    input.queries ??
    generateQueryCluster(keyword, resolved.region).map((q) => ({
      text: q.text,
      type: q.type,
      weight: q.weight,
    }));

  if (resolved.campaignKind === "url") {
    queries = await enrichQueriesWithGsc(experimentId, resolved.targetUrl, queries);
  }
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

export async function rebuildCampaignSchedule(experimentId: string): Promise<number> {
  const experiment = await prisma.experiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: { queries: { where: { active: true } } },
  });

  const completedCount = await prisma.session.count({
    where: {
      experimentId,
      status: {
        in: ["completed", "target_not_found", "search_abandoned", "target_found_no_click"],
      },
    },
  });
  const remaining = Math.max(0, experiment.monthlySessionTarget - completedCount);
  if (remaining <= 0) {
    await prisma.scheduledSession.updateMany({
      where: { experimentId, status: "scheduled" },
      data: { status: "cancelled" },
    });
    return 0;
  }

  const identities = await getCampaignIdentityPool(
    experimentId,
    experiment.focusRegion,
    experiment.focusCity,
  );
  if (identities.length === 0) {
    throw new Error("No identities in the campaign pool — assign identities before scheduling.");
  }

  await prisma.scheduledSession.updateMany({
    where: { experimentId, status: "scheduled" },
    data: { status: "cancelled" },
  });

  const created = await generateCampaignSchedule({
    experiment,
    queries: experiment.queries,
    identities,
    totalSessions: remaining,
    startDate: new Date(),
    durationDays: experiment.campaignDurationDays,
  });

  if (created === 0) {
    throw new Error(
      "Could not place any sessions. Add more identities or lower the repeat-gap / daily caps.",
    );
  }

  return created;
}

export async function runCampaign(experimentId: string): Promise<CampaignWithQueries> {
  const existing = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + existing.campaignDurationDays);

  const scheduledCount = await prisma.scheduledSession.count({
    where: { experimentId, status: "scheduled" },
  });

  if (scheduledCount === 0) {
    const identities = await getCampaignIdentityPool(
      experimentId,
      existing.focusRegion,
      existing.focusCity,
    );
    if (identities.length === 0) {
      throw new Error("Cannot start: no identities in the campaign pool.");
    }

    const fresh = await prisma.experiment.findUniqueOrThrow({
      where: { id: experimentId },
      include: { queries: { where: { active: true } } },
    });

    if (fresh.queries.length === 0) {
      throw new Error("Cannot start: no active queries to schedule.");
    }

    const created = await generateCampaignSchedule({
      experiment: fresh,
      queries: fresh.queries,
      identities,
      totalSessions: fresh.monthlySessionTarget,
      startDate,
      durationDays: fresh.campaignDurationDays,
    });

    if (created === 0 && fresh.monthlySessionTarget > 0) {
      throw new Error(
        "Cannot start: could not schedule any sessions. Add identities or relax gap/daily limits.",
      );
    }
  }

  await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      status: "active",
      startDate,
      endDate,
    },
  });

  await enableRunner();

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
    city: input.focusCity ?? campaign?.focusCity ?? undefined,
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
  selected: boolean;
  warmup: ReturnType<typeof computeWarmupProgress>;
  createdAt: string;
  totalSessions: number;
  googleSessions: number;
  blockedSessions: number;
}

export async function getCampaignIdentities(experimentId: string): Promise<CampaignIdentityRow[]> {
  await assignMissingPersonas();

  const campaign = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const [sessions, selections, warmupRemaining, identities] = await Promise.all([
    prisma.session.findMany({
      where: { experimentId },
      select: {
        identityId: true,
        status: true,
        targetClicked: true,
        createdAt: true,
      },
    }),
    prisma.experimentIdentity.findMany({ where: { experimentId } }),
    prisma.warmupSession.groupBy({
      by: ["identityId"],
      where: { status: "scheduled" },
      _count: { _all: true },
    }),
    prisma.identity.findMany({ orderBy: { externalId: "asc" } }),
  ]);

  const selectedIds = new Set(
    selections.filter((row) => row.selected).map((row) => row.identityId),
  );
  const hasExplicitSelection = selections.length > 0;
  const warmupRemainingByIdentity = new Map(
    warmupRemaining.map((row) => [row.identityId, row._count._all]),
  );

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

  const focusRegion = campaign.focusRegion;
  const focusCity = campaign.focusCity;

  return identities.map((identity) => {
    const stats = usage.get(identity.id);
    const inRegionPool = focusCity
      ? identity.city === focusCity
      : !focusRegion || identity.region === focusRegion;
    const selected = hasExplicitSelection
      ? selectedIds.has(identity.id)
      : inRegionPool &&
        (!campaign.requireWarmupIdentities || computeWarmupProgress(identity).eligible);

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
      selected,
      warmup: computeWarmupProgress(
        identity,
        warmupRemainingByIdentity.get(identity.id) ?? 0,
      ),
      createdAt: identity.createdAt.toISOString(),
      totalSessions: identity.totalSessions,
      googleSessions: identity.googleSessions,
      blockedSessions: identity.blockedSessions,
    };
  });
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
    campaignKind: campaign.campaignKind,
    region: campaign.focusRegion ?? "ALL",
    focusCity: campaign.focusCity,
    gmbBusinessName: campaign.gmbBusinessName,
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
    campaignKind: campaign.campaignKind,
    region: campaign.focusRegion ?? "ALL",
    focusCity: campaign.focusCity,
    gmbBusinessName: campaign.gmbBusinessName,
    gmbPlaceId: campaign.gmbPlaceId,
    gmbMapsUrl: campaign.gmbMapsUrl,
    gmbActions: parseActionsJson(campaign.gmbActionsJson),
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
