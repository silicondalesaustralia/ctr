import type { Experiment, ExperimentQuery, TreatmentGroup } from "@prisma/client";
import { prisma } from "../db/client.js";
import { loadExperimentConfig, slugify, type ExperimentConfig } from "../config/experiments.js";
import {
  buildExperimentName,
  extractTargetDomain,
  generateQueryCluster,
  resolveRegionTimezone,
} from "./query-generator.js";
import { randomUUID } from "node:crypto";

export interface CreateExperimentInput {
  keyword: string;
  targetUrl: string;
  region: string;
  name?: string;
  sessionsPerMonth?: number;
  activate?: boolean;
  campaignKind?: "url" | "gmb";
  focusCity?: string | null;
  gmbBusinessName?: string | null;
  gmbPlaceId?: string | null;
  gmbMapsUrl?: string | null;
  gmbActionsJson?: string | null;
  targetDomain?: string;
}

export async function createExperimentFromInput(
  input: CreateExperimentInput,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[] }> {
  const keyword = input.keyword.trim();
  const targetUrl = input.targetUrl.trim();
  const region = input.region.trim().toUpperCase();
  const targetDomain = input.targetDomain ?? extractTargetDomain(targetUrl);
  const name = input.name?.trim() || buildExperimentName(keyword, region);
  const baseSlug = slugify(name);
  const slug = await uniqueSlug(baseSlug);
  const generatedQueries = generateQueryCluster(keyword, region);
  const timezone = resolveRegionTimezone(region);

  const experiment = await prisma.experiment.create({
    data: {
      name,
      slug,
      targetUrl,
      targetDomain,
      campaignKind: input.campaignKind === "gmb" ? "gmb" : "url",
      status: input.activate ? "active" : "draft",
      monthlySessionTarget: input.sessionsPerMonth ?? 100,
      focusRegion: region === "ALL" ? null : region,
      focusCity: input.focusCity ?? null,
      gmbBusinessName: input.gmbBusinessName ?? null,
      gmbPlaceId: input.gmbPlaceId ?? null,
      gmbMapsUrl: input.gmbMapsUrl ?? null,
      gmbActionsJson: input.gmbActionsJson ?? null,
      scheduleTimezone: timezone,
      maxSerpPages: 3,
    },
  });

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

async function uniqueSlug(baseSlug: string): Promise<string> {
  const existing = await prisma.experiment.findUnique({ where: { slug: baseSlug } });
  if (!existing) {
    return baseSlug;
  }

  return `${baseSlug}-${randomUUID().slice(0, 6)}`;
}

export async function createExperimentFromConfig(
  filePath: string,
): Promise<{ experiment: Experiment; queries: ExperimentQuery[] }> {
  const config = loadExperimentConfig(filePath);
  const slug = config.experiment.slug ?? slugify(config.experiment.name);

  const experiment = await prisma.experiment.upsert({
    where: { slug },
    update: {
      name: config.experiment.name,
      targetUrl: config.experiment.target_url,
      targetDomain: config.experiment.target_domain,
      monthlySessionTarget: config.experiment.sessions_per_month,
      baselineDays: config.experiment.baseline_days,
      treatmentDays: config.experiment.treatment_days,
      postTreatmentDays: config.experiment.post_treatment_days,
      maxSerpPages: config.search?.max_serp_pages ?? 3,
      scheduleTimezone: config.schedule?.timezone ?? "Australia/Adelaide",
      scheduleStart: config.schedule?.allowed_start ?? "06:30",
      scheduleEnd: config.schedule?.allowed_end ?? "23:00",
      maxSessionsPerIdentityPerDay:
        config.schedule?.max_sessions_per_identity_per_day ?? 1,
      repeatIdentityMinGapDays: config.schedule?.repeat_identity_min_gap_days ?? 2,
      minMinutesBetweenGlobalSessions:
        config.schedule?.min_minutes_between_global_sessions ?? 5,
    },
    create: {
      name: config.experiment.name,
      slug,
      targetUrl: config.experiment.target_url,
      targetDomain: config.experiment.target_domain,
      monthlySessionTarget: config.experiment.sessions_per_month,
      baselineDays: config.experiment.baseline_days,
      treatmentDays: config.experiment.treatment_days,
      postTreatmentDays: config.experiment.post_treatment_days,
      maxSerpPages: config.search?.max_serp_pages ?? 3,
      scheduleTimezone: config.schedule?.timezone ?? "Australia/Adelaide",
      scheduleStart: config.schedule?.allowed_start ?? "06:30",
      scheduleEnd: config.schedule?.allowed_end ?? "23:00",
      maxSessionsPerIdentityPerDay:
        config.schedule?.max_sessions_per_identity_per_day ?? 1,
      repeatIdentityMinGapDays: config.schedule?.repeat_identity_min_gap_days ?? 2,
      minMinutesBetweenGlobalSessions:
        config.schedule?.min_minutes_between_global_sessions ?? 5,
    },
  });

  await prisma.experimentQuery.deleteMany({ where: { experimentId: experiment.id } });

  const queries: ExperimentQuery[] = [];
  for (const q of config.experiment.queries) {
    const query = await prisma.experimentQuery.create({
      data: {
        experimentId: experiment.id,
        query: q.text,
        queryType: q.type,
        weight: q.weight,
        active: true,
      },
    });
    queries.push(query);
  }

  return { experiment, queries };
}

export function selectWeightedQuery<T extends { weight: number; id: string }>(
  queries: T[],
  random = Math.random(),
): T {
  const total = queries.reduce((sum, q) => sum + q.weight, 0);
  let cursor = random * total;
  for (const query of queries) {
    cursor -= query.weight;
    if (cursor <= 0) return query;
  }
  return queries[queries.length - 1]!;
}

export function selectEngagementTemplate(
  weights: Record<string, number>,
  random = Math.random(),
): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let cursor = random * total;
  for (const [name, weight] of entries) {
    cursor -= weight;
    if (cursor <= 0) return name;
  }
  return entries[entries.length - 1]![0];
}

export async function getExperimentBySlug(slug: string): Promise<Experiment | null> {
  return prisma.experiment.findUnique({ where: { slug } });
}

export async function getExperimentQueries(experimentId: string): Promise<ExperimentQuery[]> {
  return prisma.experimentQuery.findMany({
    where: { experimentId, active: true },
  });
}

export function defaultEngagementWeights(): Record<string, number> {
  return {
    read_only: 0.35,
    internal_navigation: 0.3,
    short_visit: 0.15,
    long_read: 0.2,
  };
}

export function defaultTreatmentGroups(): TreatmentGroup[] {
  return ["search", "direct", "none"];
}

export type { ExperimentConfig };
