import { prisma } from "../db/client.js";

const HISTORY_LIMIT = 30;

export interface RankPoint {
  /** Null when the check ran but the target wasn't found. */
  position: number | null;
  source: string | null;
  localDate: string;
  capturedAt: string | null;
}

/** Rank snapshots on the main keyword, oldest first: one fixed point per check, unlike sessions. */
export async function getSnapshotRankHistory(experimentId: string, keyword: string): Promise<RankPoint[]> {
  if (!keyword) return [];
  const rows = await prisma.rankSnapshot.findMany({
    where: { experimentId, query: keyword, status: { in: ["captured", "not_found"] } },
    orderBy: { capturedAt: "desc" },
    take: HISTORY_LIMIT,
    select: { position: true, source: true, localDate: true, capturedAt: true },
  });
  return rows.reverse().map((row) => ({
    position: row.position,
    source: row.source,
    localDate: row.localDate,
    capturedAt: row.capturedAt?.toISOString() ?? null,
  }));
}

export async function isRankCheckQueued(experimentId: string): Promise<boolean> {
  const count = await prisma.rankSnapshot.count({
    where: { experimentId, status: { in: ["pending", "running"] } },
  });
  return count > 0;
}
