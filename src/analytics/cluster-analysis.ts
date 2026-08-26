import type { QueryMetrics } from "./ranking-analysis.js";

export interface ClusterMetrics {
  clusterAveragePosition: number;
  clusterImpressions: number;
  clusterClicks: number;
  rankingQueryCount: number;
  top10QueryCount: number;
  top20QueryCount: number;
}

export function buildClusterMetrics(
  metrics: QueryMetrics[],
  treatedQueries: string[],
  untreatedQueries: string[],
): {
  treated: ClusterMetrics;
  untreatedMovement: number;
} {
  const treatedMetrics = metrics.filter((m) => treatedQueries.includes(m.query));
  const untreatedMetrics = metrics.filter((m) => untreatedQueries.includes(m.query));

  const treated: ClusterMetrics = {
    clusterAveragePosition: average(treatedMetrics.map((m) => m.treatmentPosition)),
    clusterImpressions: sum(treatedMetrics.map((m) => m.treatmentImpressions)),
    clusterClicks: 0,
    rankingQueryCount: treatedMetrics.filter((m) => m.treatmentPosition > 0).length,
    top10QueryCount: treatedMetrics.filter((m) => m.treatmentPosition <= 10).length,
    top20QueryCount: treatedMetrics.filter((m) => m.treatmentPosition <= 20).length,
  };

  const untreatedBaseline = average(untreatedMetrics.map((m) => m.baselinePosition));
  const untreatedTreatment = average(untreatedMetrics.map((m) => m.treatmentPosition));

  return {
    treated,
    untreatedMovement: untreatedBaseline - untreatedTreatment,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
