import { prisma } from "../db/client.js";
import type { GscQueryMetrics } from "./types.js";

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function fetchGscMetricsForExperiment(
  experimentId: string,
  targetUrl: string,
  lookbackDays = 28,
): Promise<Map<string, GscQueryMetrics>> {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  const snapshots = await prisma.rankingSnapshot.findMany({
    where: {
      experimentId,
      page: { contains: new URL(targetUrl).pathname },
      date: { gte: since },
    },
    orderBy: { date: "desc" },
  });

  const byQuery = new Map<string, { impressions: number; clicks: number; positionSum: number; count: number }>();

  for (const row of snapshots) {
    const key = normalizeQuery(row.query);
    const existing = byQuery.get(key) ?? { impressions: 0, clicks: 0, positionSum: 0, count: 0 };
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    existing.positionSum += row.position;
    existing.count += 1;
    byQuery.set(key, existing);
  }

  const result = new Map<string, GscQueryMetrics>();
  for (const [query, stats] of byQuery.entries()) {
    result.set(query, {
      query,
      position: stats.count > 0 ? stats.positionSum / stats.count : 0,
      impressions28d: stats.impressions,
      clicks28d: stats.clicks,
      ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
    });
  }

  return result;
}

export function matchGscMetrics(
  queryText: string,
  gscMap: Map<string, GscQueryMetrics>,
): GscQueryMetrics | null {
  const normalized = normalizeQuery(queryText);
  if (gscMap.has(normalized)) {
    return gscMap.get(normalized) ?? null;
  }

  for (const [key, metrics] of gscMap.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return metrics;
    }
  }

  return null;
}

export async function buildSiteCurveFromExperiment(experimentId: string): Promise<
  Array<{ position: number; ctr: number; impressions: number }>
> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const snapshots = await prisma.rankingSnapshot.findMany({
    where: { experimentId, date: { gte: since }, impressions: { gt: 0 } },
  });

  return snapshots.map((row) => ({
    position: row.position,
    ctr: row.ctr > 0 ? row.ctr : row.impressions > 0 ? row.clicks / row.impressions : 0,
    impressions: row.impressions,
  }));
}
