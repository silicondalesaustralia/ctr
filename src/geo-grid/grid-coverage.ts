import { prisma } from "../db/client.js";

export interface GridScanTotals {
  inPackCount: number;
  pointCount: number;
  avgRank: number | null;
  localDate: string;
}

export interface GridCoverage extends GridScanTotals {
  /** The finished scan before the latest, for "up or down since last scan". */
  previous: GridScanTotals | null;
}

/** Latest two finished grids on the main keyword, for the campaign list. */
export async function getLatestGridCoverage(experimentId: string, keyword: string): Promise<GridCoverage | null> {
  if (!keyword) return null;
  const scans = await prisma.geoGridScan.findMany({
    where: { experimentId, query: keyword, status: { in: ["complete", "partial"] }, inPackCount: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 2,
    select: { inPackCount: true, avgRank: true, localDate: true, _count: { select: { points: true } } },
  });
  const totals = scans.map(
    (scan): GridScanTotals => ({
      inPackCount: scan.inPackCount ?? 0,
      pointCount: scan._count.points,
      avgRank: scan.avgRank,
      localDate: scan.localDate,
    }),
  );
  const [latest, previous] = totals;
  return latest ? { ...latest, previous: previous ?? null } : null;
}
