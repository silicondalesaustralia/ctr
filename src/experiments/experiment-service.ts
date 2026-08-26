import type { Experiment, ExperimentQuery, TreatmentGroup } from "@prisma/client";
import { prisma } from "../db/client.js";
import { loadExperimentConfig, slugify, type ExperimentConfig } from "../config/experiments.js";

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
