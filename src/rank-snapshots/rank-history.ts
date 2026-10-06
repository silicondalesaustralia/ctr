import { prisma } from "../db/client.js";

const HISTORY_LIMIT = 30;
/** National campaigns store one row per panel city per check. */
const PANEL_ROWS_PER_CHECK = 5;

export interface RankPoint {
  /** Null when the check ran but the target wasn't found. */
  position: number | null;
  /** "national" when the point averages the city panel. */
  source: string | null;
  localDate: string;
  capturedAt: string | null;
  /** National panel only: cities where the target was found, out of cities checked. */
  foundCities?: number;
  totalCities?: number;
}

interface HistoryRow {
  position: number | null;
  source: string | null;
  localDate: string;
  capturedAt: Date | null;
  panelCity: string;
}

/** Latest row per panel city for one day, averaged over the cities where the target was found. */
function nationalPoint(localDate: string, rows: HistoryRow[]): RankPoint {
  const latestByCity = new Map<string, HistoryRow>();
  for (const row of rows) if (!latestByCity.has(row.panelCity)) latestByCity.set(row.panelCity, row);
  const cities = [...latestByCity.values()];
  const found = cities.flatMap((row) => (row.position != null ? [row.position] : []));
  return {
    position: found.length > 0 ? Math.round(found.reduce((a, b) => a + b, 0) / found.length) : null,
    source: "national",
    localDate,
    capturedAt: cities[0]?.capturedAt?.toISOString() ?? null,
    foundCities: found.length,
    totalCities: cities.length,
  };
}

function singlePoint(row: HistoryRow): RankPoint {
  return {
    position: row.position,
    source: row.source,
    localDate: row.localDate,
    capturedAt: row.capturedAt?.toISOString() ?? null,
  };
}

/** Rank snapshots on the main keyword, oldest first: one fixed point per check, unlike sessions. */
export async function getSnapshotRankHistory(experimentId: string, keyword: string): Promise<RankPoint[]> {
  if (!keyword) return [];
  const rows: HistoryRow[] = await prisma.rankSnapshot.findMany({
    where: { experimentId, query: keyword, status: { in: ["captured", "not_found"] } },
    orderBy: { capturedAt: "desc" },
    take: HISTORY_LIMIT * PANEL_ROWS_PER_CHECK,
    select: { position: true, source: true, localDate: true, capturedAt: true, panelCity: true },
  });

  const points: RankPoint[] = [];
  const panelByDate = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    if (!row.panelCity) {
      points.push(singlePoint(row));
      continue;
    }
    panelByDate.set(row.localDate, [...(panelByDate.get(row.localDate) ?? []), row]);
  }
  for (const [localDate, dateRows] of panelByDate) points.push(nationalPoint(localDate, dateRows));

  return points
    .sort((a, b) => (a.capturedAt ?? a.localDate).localeCompare(b.capturedAt ?? b.localDate))
    .slice(-HISTORY_LIMIT);
}

export async function isRankCheckQueued(experimentId: string): Promise<boolean> {
  const count = await prisma.rankSnapshot.count({
    where: { experimentId, status: { in: ["pending", "running"] } },
  });
  return count > 0;
}
