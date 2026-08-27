import type { Experiment, ExperimentQuery } from "@prisma/client";
import { prisma } from "../db/client.js";
import { buildSiteCurveFromExperiment } from "./gsc-demand.js";
import {
  calculateCampaignIntensity,
  normalizeQueryWeights,
} from "./intensity-calculator.js";
import type { QueryDemandInput, TrafficModelInput } from "./types.js";
import { generateCampaignSchedule } from "../scheduler/schedule-generator.js";
import { getCampaignIdentityPool } from "../warmup/warmup-service.js";

export async function getLatestPositionsForQueries(
  experimentId: string,
  queries: ExperimentQuery[],
): Promise<Map<string, number>> {
  const positions = new Map<string, number>();

  for (const query of queries) {
    const recentSession = await prisma.session.findFirst({
      where: {
        experimentId,
        queryText: query.query,
        observedPosition: { not: null },
        status: "completed",
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentSession?.observedPosition) {
      positions.set(query.id, recentSession.observedPosition);
      continue;
    }

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const snapshot = await prisma.rankingSnapshot.findFirst({
      where: { experimentId, query: query.query, date: { gte: since } },
      orderBy: { date: "desc" },
    });

    if (snapshot) {
      positions.set(query.id, snapshot.position);
    } else if (query.startingPosition) {
      positions.set(query.id, query.startingPosition);
    }
  }

  return positions;
}

export function buildQueryDemandInputs(
  queries: ExperimentQuery[],
  positionOverrides?: Map<string, number>,
): QueryDemandInput[] {
  return queries.map((query) => ({
    text: query.query,
    type: query.queryType,
    weight: query.weight,
    monthlySearchVolume: query.monthlySearchVolume,
    startingPosition: positionOverrides?.get(query.id) ?? query.startingPosition,
    gscImpressions28d: query.gscImpressions28d,
    gscClicks28d: query.gscClicks28d,
  }));
}

export function buildTrafficModel(experiment: Experiment): TrafficModelInput {
  return {
    campaignDurationDays: experiment.campaignDurationDays,
    treatmentIntensity: experiment.treatmentIntensity,
    maxShareOfSearchDemand: experiment.maxShareOfSearchDemand,
    maxShareOfGscImpressions: experiment.maxShareOfGscImpressions,
    ctrSource: experiment.ctrSource,
    desktopPercent: experiment.desktopPercent,
  };
}

export async function recalculateCampaignPacing(
  experimentId: string,
  options?: { regenerateSchedule?: boolean },
): Promise<{ intensity: ReturnType<typeof calculateCampaignIntensity>; updated: number }> {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: { queries: { where: { active: true } } },
  });

  if (!experiment) {
    throw new Error(`Experiment not found: ${experimentId}`);
  }

  const completedCount = await prisma.session.count({
    where: {
      experimentId,
      status: { in: ["completed", "target_not_found", "search_abandoned", "target_found_no_click"] },
    },
  });

  const positionOverrides = await getLatestPositionsForQueries(experimentId, experiment.queries);
  const siteCurveData =
    experiment.ctrSource === "gsc_site_curve"
      ? await buildSiteCurveFromExperiment(experimentId)
      : null;

  const identityCount = await prisma.identity.count({ where: { active: true } });

  const intensity = calculateCampaignIntensity({
    queries: buildQueryDemandInputs(experiment.queries, positionOverrides),
    trafficModel: buildTrafficModel(experiment),
    siteCurveData,
    activeIdentityCount: identityCount,
    maxSessionsPerIdentityPerDay: experiment.maxSessionsPerIdentityPerDay,
    repeatIdentityMinGapDays: experiment.repeatIdentityMinGapDays,
  });

  const normalized = normalizeQueryWeights(intensity.queries);
  const remainingBudget = Math.max(0, intensity.totalAllocatedSessions - completedCount);

  for (let i = 0; i < experiment.queries.length; i += 1) {
    const query = experiment.queries[i]!;
    const result = normalized[i]!;
    const position = positionOverrides.get(query.id) ?? query.startingPosition;

    await prisma.experimentQuery.update({
      where: { id: query.id },
      data: {
        startingPosition: position,
        weight: result.weight,
        allocatedSessions: result.allocatedSessions,
      },
    });
  }

  await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      monthlySessionTarget: intensity.totalAllocatedSessions,
      lastPacingRecalcAt: new Date(),
    },
  });

  let updated = 0;
  if (options?.regenerateSchedule && remainingBudget > 0) {
    await prisma.scheduledSession.updateMany({
      where: { experimentId, status: "scheduled" },
      data: { status: "cancelled" },
    });

    const refreshed = await prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { queries: { where: { active: true } } },
    });

    if (refreshed) {
      const identities = await getCampaignIdentityPool(experimentId, refreshed.focusRegion);
      updated = await generateCampaignSchedule({
        experiment: refreshed,
        queries: refreshed.queries,
        identities,
        totalSessions: remainingBudget,
        startDate: new Date(),
      });
    }
  }

  return { intensity, updated };
}

export async function maybeRecalculateAdaptivePacing(experimentId: string): Promise<boolean> {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment?.adaptivePacing || experiment.status !== "active") {
    return false;
  }

  const lastRecalc = experiment.lastPacingRecalcAt ?? experiment.startDate ?? experiment.createdAt;
  const daysSinceRecalc =
    (Date.now() - lastRecalc.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceRecalc < experiment.recalculateEveryDays) {
    return false;
  }

  await recalculateCampaignPacing(experimentId, { regenerateSchedule: true });
  return true;
}
