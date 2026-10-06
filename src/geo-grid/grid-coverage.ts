import { prisma } from "../db/client.js";

export interface GridCoverage {
  inPackCount: number;
  pointCount: number;
}

/** Latest finished grid on the main keyword, for the campaign list ("3-pack 9/25"). */
export async function getLatestGridCoverage(experimentId: string, keyword: string): Promise<GridCoverage | null> {
  if (!keyword) return null;
  const scan = await prisma.geoGridScan.findFirst({
    where: { experimentId, query: keyword, status: { in: ["complete", "partial"] }, inPackCount: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { inPackCount: true, _count: { select: { points: true } } },
  });
  if (!scan || scan.inPackCount === null) return null;
  return { inPackCount: scan.inPackCount, pointCount: scan._count.points };
}
