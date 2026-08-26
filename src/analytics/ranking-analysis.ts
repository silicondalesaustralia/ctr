import type { Experiment, ExperimentQuery } from "@prisma/client";

export interface QueryMetrics {
  query: string;
  baselinePosition: number;
  treatmentPosition: number;
  postTreatmentPosition: number;
  baselineImpressions: number;
  treatmentImpressions: number;
  postTreatmentImpressions: number;
  baselineCtr: number;
  treatmentCtr: number;
  postTreatmentCtr: number;
  positionDelta: number;
}

export function calculatePositionDelta(
  baselinePosition: number,
  treatmentPosition: number,
): number {
  return baselinePosition - treatmentPosition;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function aggregateQueryMetrics(
  snapshots: Array<{
    query: string;
    date: Date;
    position: number;
    impressions: number;
    ctr: number;
  }>,
  baselineEnd: Date,
  treatmentEnd: Date,
): QueryMetrics[] {
  const byQuery = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const list = byQuery.get(snapshot.query) ?? [];
    list.push(snapshot);
    byQuery.set(snapshot.query, list);
  }

  const results: QueryMetrics[] = [];
  for (const [query, rows] of byQuery.entries()) {
    const baseline = rows.filter((r) => r.date <= baselineEnd);
    const treatment = rows.filter((r) => r.date > baselineEnd && r.date <= treatmentEnd);
    const post = rows.filter((r) => r.date > treatmentEnd);

    const baselinePosition = average(baseline.map((r) => r.position));
    const treatmentPosition = average(treatment.map((r) => r.position));
    const postTreatmentPosition = average(post.map((r) => r.position));

    results.push({
      query,
      baselinePosition,
      treatmentPosition,
      postTreatmentPosition,
      baselineImpressions: average(baseline.map((r) => r.impressions)),
      treatmentImpressions: average(treatment.map((r) => r.impressions)),
      postTreatmentImpressions: average(post.map((r) => r.impressions)),
      baselineCtr: average(baseline.map((r) => r.ctr)),
      treatmentCtr: average(treatment.map((r) => r.ctr)),
      postTreatmentCtr: average(post.map((r) => r.ctr)),
      positionDelta: calculatePositionDelta(baselinePosition, treatmentPosition),
    });
  }

  return results;
}

export function interpretEffect(positionDelta: number, controlDelta: number): string {
  const diff = positionDelta - controlDelta;
  if (diff <= 0.2) return "No observable effect";
  if (diff < 1) return "Weak positive association";
  if (diff < 2.5) return "Moderate positive association";
  if (diff >= 2.5) return "Strong repeatable association";
  return "Inconclusive";
}

export function buildExperimentWindows(experiment: Experiment): {
  baselineEnd: Date;
  treatmentEnd: Date;
} {
  const start = experiment.startDate ?? new Date();
  const baselineEnd = new Date(start);
  baselineEnd.setDate(baselineEnd.getDate() + experiment.baselineDays);
  const treatmentEnd = new Date(baselineEnd);
  treatmentEnd.setDate(treatmentEnd.getDate() + experiment.treatmentDays);
  return { baselineEnd, treatmentEnd };
}

export function weightedClusterAverage(
  metrics: QueryMetrics[],
  weights: Record<string, number>,
): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const metric of metrics) {
    const weight = weights[metric.query] ?? 0;
    weightedSum += metric.treatmentPosition * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
