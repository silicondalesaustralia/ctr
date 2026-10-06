import type { Experiment, GeoGridPoint, GeoGridScan, Identity } from "@prisma/client";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import {
  BLOCK_RETRY_DELAY_MINUTES,
  registerGoogleBlock,
  registerGoogleClean,
} from "../identities/block-policy.js";
import { pickSnapshotIdentity } from "../rank-snapshots/snapshot-identity.js";
import { withSnapshotBrowser } from "../rank-snapshots/snapshot-browser.js";
import { PROXY_POOL_DEFER_MINUTES } from "../scheduler/retry-policy.js";
import { ProxyPoolExhaustedError } from "../sessions/clean-lease.js";
import { addMinutes, randomBetween, sleep } from "../utils/helpers.js";
import { captureGridPoint } from "./grid-point-capture.js";
import { isCentreCell } from "./grid-points.js";
import { finaliseGridScan } from "./grid-summary.js";

/** A blocked scan resumes from its unfinished points on a fresh IP, up to this many sessions. */
const MAX_SCAN_ATTEMPTS = 4;
/** A browser that fails this many points in a row is stuck; resume in a fresh one. */
const MAX_CONSECUTIVE_POINT_ERRORS = 2;
const POINT_ERROR_RETRY_MINUTES = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Search every unfinished point in one browser session; stops at the first Google block. */
async function capturePoints(
  scan: GeoGridScan,
  points: GeoGridPoint[],
  experiment: Experiment,
  identity: Identity,
): Promise<"done" | "blocked" | "stuck"> {
  const centre = { latitude: scan.centreLatitude, longitude: scan.centreLongitude };
  return withSnapshotBrowser(identity, centre, async ({ page, egress }) => {
    let consecutiveErrors = 0;
    for (const [index, point] of points.entries()) {
      const isCentre = isCentreCell(point, scan.gridSize);
      try {
        const capture = await captureGridPoint(page, experiment, scan.query, point, isCentre);
        if (capture.outcome === "blocked") {
          await registerGoogleBlock(identity.id, egress?.ip);
          await prisma.geoGridScan.update({
            where: { id: scan.id },
            data: { errorMessage: capture.blockReason ?? "blocked" },
          });
          return "blocked";
        }
        await prisma.geoGridPoint.update({
          where: { id: point.id },
          data: {
            status: capture.outcome,
            position: capture.position,
            source: capture.source,
            resultTitle: capture.resultTitle,
            topResultsJson: JSON.stringify(capture.topResults),
            errorMessage: null,
            capturedAt: new Date(),
          },
        });
        if (capture.serpImageJpeg) {
          await prisma.geoGridScan.update({
            where: { id: scan.id },
            data: { centreImageJpeg: capture.serpImageJpeg },
          });
        }
        consecutiveErrors = 0;
      } catch (error) {
        await prisma.geoGridPoint.update({
          where: { id: point.id },
          data: { errorMessage: errorMessage(error) },
        });
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_POINT_ERRORS) return "stuck";
      }
      if (index < points.length - 1) await sleep(randomBetween(6_000, 15_000));
    }
    await registerGoogleClean(identity.id);
    return "done";
  });
}

async function retryLater(scan: GeoGridScan, minutes: number, message: string): Promise<void> {
  const final = scan.attemptCount + 1 >= MAX_SCAN_ATTEMPTS;
  if (final) {
    await prisma.geoGridScan.update({ where: { id: scan.id }, data: { errorMessage: message } });
    await finaliseGridScan(scan.id, true);
    return;
  }
  await prisma.geoGridScan.update({
    where: { id: scan.id },
    data: { status: "pending", scheduledAt: addMinutes(new Date(), minutes), errorMessage: message },
  });
}

export async function runGridScan(scanId: string): Promise<void> {
  const scan = await prisma.geoGridScan.findUnique({ where: { id: scanId }, include: { experiment: true } });
  if (!scan || scan.status !== "pending") return;
  const points = await prisma.geoGridPoint.findMany({
    where: { scanId, status: "pending" },
    orderBy: [{ row: "asc" }, { col: "asc" }],
  });
  if (points.length === 0) {
    await finaliseGridScan(scanId, true);
    return;
  }

  const identity = await pickSnapshotIdentity(scan.experiment);
  if (!identity) {
    await prisma.geoGridScan.update({
      where: { id: scanId },
      data: { status: "error", errorMessage: `No runnable identity for ${scan.experiment.country}` },
    });
    return;
  }

  await prisma.geoGridScan.update({
    where: { id: scanId },
    data: { status: "running", startedAt: scan.startedAt ?? new Date(), identityExternalId: identity.externalId },
  });

  try {
    const outcome = await capturePoints(scan, points, scan.experiment, identity);
    await prisma.geoGridScan.update({ where: { id: scanId }, data: { attemptCount: { increment: 1 } } });
    const remaining = await prisma.geoGridPoint.count({ where: { scanId, status: "pending" } });
    if (remaining === 0) await finaliseGridScan(scanId, true);
    else if (outcome === "blocked") await retryLater(scan, BLOCK_RETRY_DELAY_MINUTES, "blocked");
    else await retryLater(scan, POINT_ERROR_RETRY_MINUTES, "points failed; resuming in a fresh browser");
  } catch (error) {
    if (error instanceof ProxyPoolExhaustedError) {
      await prisma.geoGridScan.update({
        where: { id: scanId },
        data: { status: "pending", scheduledAt: addMinutes(new Date(), PROXY_POOL_DEFER_MINUTES) },
      });
      return;
    }
    await prisma.geoGridScan.update({ where: { id: scanId }, data: { attemptCount: { increment: 1 } } });
    await retryLater(scan, BLOCK_RETRY_DELAY_MINUTES, errorMessage(error));
    logger.error({ event: "geo_grid_scan_failed", scanId, error: errorMessage(error) });
  }
  logger.info({ event: "geo_grid_scan_processed", scanId, points: points.length, identity: identity.externalId });
}

/** Worker boot: nothing can be mid-scan, so running scans go back to the queue. */
export async function resetStrandedGridScans(): Promise<number> {
  const result = await prisma.geoGridScan.updateMany({ where: { status: "running" }, data: { status: "pending" } });
  return result.count;
}
