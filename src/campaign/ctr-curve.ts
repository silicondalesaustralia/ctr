import type { PositionBucket } from "./types.js";

/** Industry fallback CTR by position (organic SERP). */
export function defaultCtrForPosition(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 3) return 0.12;
  if (position <= 5) return 0.07;
  if (position <= 10) return 0.03;
  if (position <= 15) return 0.015;
  if (position <= 20) return 0.008;
  if (position <= 30) return 0.003;
  if (position <= 40) return 0.001;
  return 0.0005;
}

export function positionBucket(position: number): string {
  if (position <= 3) return "1-3";
  if (position <= 5) return "4-5";
  if (position <= 10) return "6-10";
  if (position <= 20) return "11-20";
  if (position <= 30) return "21-30";
  return "31+";
}

export function buildGscSiteCurve(
  snapshots: Array<{ position: number; ctr: number; impressions: number }>,
): PositionBucket[] {
  const buckets: Record<string, { ctrSum: number; weight: number; count: number; min: number; max: number }> = {
    "1-3": { ctrSum: 0, weight: 0, count: 0, min: 1, max: 3 },
    "4-5": { ctrSum: 0, weight: 0, count: 0, min: 4, max: 5 },
    "6-10": { ctrSum: 0, weight: 0, count: 0, min: 6, max: 10 },
    "11-20": { ctrSum: 0, weight: 0, count: 0, min: 11, max: 20 },
    "21-30": { ctrSum: 0, weight: 0, count: 0, min: 21, max: 30 },
    "31+": { ctrSum: 0, weight: 0, count: 0, min: 31, max: 100 },
  };

  for (const row of snapshots) {
    if (row.impressions <= 0) continue;
    const key = positionBucket(row.position);
    const bucket = buckets[key];
    if (!bucket) continue;
    bucket.ctrSum += row.ctr * row.impressions;
    bucket.weight += row.impressions;
    bucket.count += 1;
  }

  return Object.values(buckets).map((bucket) => ({
    min: bucket.min,
    max: bucket.max,
    avgCtr: bucket.weight > 0 ? bucket.ctrSum / bucket.weight : defaultCtrForPosition(bucket.min),
    sampleSize: bucket.count,
  }));
}

export function ctrForPosition(
  position: number,
  siteCurve: PositionBucket[] | null,
): number {
  if (siteCurve && siteCurve.some((b) => b.sampleSize > 0)) {
    const bucket = siteCurve.find((b) => position >= b.min && position <= b.max);
    if (bucket && bucket.sampleSize > 0) {
      return bucket.avgCtr;
    }
  }
  return defaultCtrForPosition(position);
}
