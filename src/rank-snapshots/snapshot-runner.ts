import type { RankSnapshot } from "@prisma/client";
import { prisma } from "../db/client.js";
import { runSnapshotGroup } from "./snapshot-groups.js";

/** Due rows grouped by panel city; each group searches from its own city with its own identity. */
export async function runExperimentSnapshots(experimentId: string): Promise<void> {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) return;

  const rows = await prisma.rankSnapshot.findMany({
    where: { experimentId, status: "pending", scheduledAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return;

  const groups = new Map<string, RankSnapshot[]>();
  for (const row of rows) groups.set(row.panelCity, [...(groups.get(row.panelCity) ?? []), row]);
  for (const [panelCity, groupRows] of groups) await runSnapshotGroup(experiment, groupRows, panelCity);
}

/** Worker boot: nothing can be mid-capture, so stranded rows go back to the queue. */
export async function resetStrandedSnapshots(): Promise<number> {
  const result = await prisma.rankSnapshot.updateMany({
    where: { status: "running" },
    data: { status: "pending" },
  });
  return result.count;
}
