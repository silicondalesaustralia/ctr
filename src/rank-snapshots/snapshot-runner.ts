import type { Experiment, Identity, RankSnapshot } from "@prisma/client";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import {
  BLOCK_RETRY_DELAY_MINUTES,
  registerGoogleBlock,
  registerGoogleClean,
} from "../identities/block-policy.js";
import { addMinutes, randomBetween, sleep } from "../utils/helpers.js";
import { withSnapshotBrowser } from "./snapshot-browser.js";
import { captureQuerySnapshot } from "./snapshot-capture.js";
import { pickSnapshotIdentity } from "./snapshot-identity.js";

/** First attempt plus one retry on a fresh IP, matching the campaign block policy. */
const MAX_ATTEMPTS = 2;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Running rows go back to pending for one retry, else settle on the failure status. */
async function settleFailed(ids: string[], status: "blocked" | "error", message: string): Promise<void> {
  await prisma.rankSnapshot.updateMany({
    where: { id: { in: ids }, status: "running", attemptCount: { lt: MAX_ATTEMPTS } },
    data: {
      status: "pending",
      scheduledAt: addMinutes(new Date(), BLOCK_RETRY_DELAY_MINUTES),
      errorMessage: message,
    },
  });
  await prisma.rankSnapshot.updateMany({
    where: { id: { in: ids }, status: "running" },
    data: { status, errorMessage: message },
  });
}

async function captureRows(
  rows: RankSnapshot[],
  experiment: Experiment,
  identity: Identity,
  geoPoint: GeoPoint | undefined,
): Promise<void> {
  const identityId = identity.id;
  await withSnapshotBrowser(identity, geoPoint, async ({ page, egress }) => {
    for (const [index, row] of rows.entries()) {
      try {
        const capture = await captureQuerySnapshot(page, experiment, row.query);
        if (capture.outcome === "blocked") {
          await registerGoogleBlock(identityId, egress?.ip);
          const remaining = rows.slice(index).map((item) => item.id);
          await settleFailed(remaining, "blocked", capture.blockReason ?? "blocked");
          return;
        }
        await prisma.rankSnapshot.update({
          where: { id: row.id },
          data: {
            status: capture.outcome,
            position: capture.position,
            serpPage: capture.serpPage,
            source: capture.source,
            resultTitle: capture.resultTitle,
            pageUrl: capture.pageUrl,
            egressCity: egress?.city ?? null,
            imageJpeg: capture.imageJpeg,
            errorMessage: null,
            capturedAt: new Date(),
          },
        });
      } catch (error) {
        await settleFailed([row.id], "error", errorMessage(error));
      }
      if (index < rows.length - 1) await sleep(randomBetween(8_000, 20_000));
    }
    await registerGoogleClean(identityId);
  });
}

export async function runExperimentSnapshots(experimentId: string): Promise<void> {
  const experiment = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) return;

  const rows = await prisma.rankSnapshot.findMany({
    where: { experimentId, status: "pending", scheduledAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);

  const identity = await pickSnapshotIdentity(experiment);
  if (!identity) {
    await prisma.rankSnapshot.updateMany({
      where: { id: { in: ids } },
      data: { status: "error", errorMessage: `No runnable identity in ${experiment.focusCity ?? experiment.focusRegion ?? "campaign area"}` },
    });
    return;
  }

  await prisma.rankSnapshot.updateMany({
    where: { id: { in: ids } },
    data: { status: "running", attemptCount: { increment: 1 }, identityExternalId: identity.externalId },
  });

  const geoPoint: GeoPoint | undefined =
    experiment.geoLatitude !== null && experiment.geoLongitude !== null
      ? { latitude: experiment.geoLatitude, longitude: experiment.geoLongitude }
      : undefined;

  try {
    await captureRows(rows, experiment, identity, geoPoint);
  } catch (error) {
    await settleFailed(ids, "error", errorMessage(error));
    logger.error({ event: "rank_snapshot_session_failed", experimentId, error: errorMessage(error) });
  }

  logger.info({ event: "rank_snapshots_processed", experimentId, count: rows.length, identity: identity.externalId });
}

/** Worker boot: nothing can be mid-capture, so stranded rows go back to the queue. */
export async function resetStrandedSnapshots(): Promise<number> {
  const result = await prisma.rankSnapshot.updateMany({
    where: { status: "running" },
    data: { status: "pending" },
  });
  return result.count;
}
