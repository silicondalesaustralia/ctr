import type { Experiment, ExperimentQuery, Session } from "@prisma/client";
import { prisma } from "../db/client.js";
import { generateMonthlySchedule } from "../scheduler/schedule-generator.js";
import {
  buildExperimentName,
  extractTargetDomain,
  generateQueryCluster,
  resolveRegionTimezone,
} from "./query-generator.js";
import { createExperimentFromInput, type CreateExperimentInput } from "./experiment-service.js";

export type CampaignWithQueries = Experiment & { queries: ExperimentQuery[] };

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

export function getCampaignKeyword(campaign: CampaignWithQueries): string {
  const core = campaign.queries.find((query) => query.queryType === "core");
  return core?.query ?? campaign.queries[0]?.query ?? "";
}

export async function upsertCampaign(
  input: CreateExperimentInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[] }> {
  const current = await getCurrentCampaign();

  if (!current) {
    return createExperimentFromInput({ ...input, activate: false });
  }

  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();
  const generatedQueries = generateQueryCluster(keyword, region);

  const experiment = await prisma.experiment.update({
    where: { id: current.id },
    data: {
      name: input.name?.trim() || buildExperimentName(keyword, region),
      targetUrl,
      targetDomain: extractTargetDomain(targetUrl),
      focusRegion: region === "ALL" ? null : region,
      scheduleTimezone: resolveRegionTimezone(region),
      monthlySessionTarget: input.sessionsPerMonth ?? current.monthlySessionTarget,
    },
  });

  await prisma.experimentQuery.deleteMany({ where: { experimentId: experiment.id } });

  const queries: ExperimentQuery[] = [];
  for (const query of generatedQueries) {
    const created = await prisma.experimentQuery.create({
      data: {
        experimentId: experiment.id,
        query: query.text,
        queryType: query.type,
        weight: query.weight,
        active: true,
      },
    });
    queries.push(created);
  }

  return { experiment, queries };
}

export async function runCampaign(experimentId: string): Promise<CampaignWithQueries> {
  const experiment = await prisma.experiment.update({
    where: { id: experimentId },
    data: { status: "active" },
    include: { queries: { where: { active: true } } },
  });

  await prisma.appSetting.upsert({
    where: { key: "runner_enabled" },
    update: { value: "true" },
    create: { key: "runner_enabled", value: "true" },
  });
  process.env.EXPERIMENT_RUNNER_ENABLED = "true";

  const scheduledCount = await prisma.scheduledSession.count({
    where: { experimentId, status: "scheduled" },
  });

  if (scheduledCount === 0) {
    const identities = await prisma.identity.findMany({ where: { active: true } });
    await generateMonthlySchedule({
      experiment,
      queries: experiment.queries,
      identities,
    });
  }

  return experiment;
}

export async function stopCampaign(experimentId: string): Promise<CampaignWithQueries> {
  const experiment = await prisma.experiment.update({
    where: { id: experimentId },
    data: { status: "paused" },
    include: { queries: { where: { active: true } } },
  });

  await prisma.appSetting.upsert({
    where: { key: "runner_enabled" },
    update: { value: "false" },
    create: { key: "runner_enabled", value: "false" },
  });
  process.env.EXPERIMENT_RUNNER_ENABLED = "false";

  await prisma.scheduledSession.updateMany({
    where: { experimentId, status: "scheduled" },
    data: { status: "cancelled" },
  });

  return experiment;
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

export function serializeCampaign(campaign: CampaignWithQueries) {
  return {
    id: campaign.id,
    name: campaign.name,
    slug: campaign.slug,
    status: campaign.status,
    keyword: getCampaignKeyword(campaign),
    targetUrl: campaign.targetUrl,
    targetDomain: campaign.targetDomain,
    region: campaign.focusRegion ?? "ALL",
    monthlySessionTarget: campaign.monthlySessionTarget,
    queries: campaign.queries.map((query) => ({
      text: query.query,
      type: query.queryType,
      weight: query.weight,
    })),
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
