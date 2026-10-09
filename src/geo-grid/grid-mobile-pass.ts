import type { Experiment, GeoGridPoint, GeoGridScan, Identity } from "@prisma/client";
import { GoogleBlockedError } from "../browser/blocked-detection.js";
import { matchCandidate } from "../browser/local-pack-match.js";
import { collectMobilePackCandidates } from "../browser/mobile-local.js";
import { setSearchLocation } from "../browser/set-search-location.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import { googleTargetFor } from "../geo/google-target.js";
import { BLOCK_RETRY_DELAY_MINUTES, registerGoogleBlock, registerGoogleClean } from "../identities/block-policy.js";
import { mobileIdentitiesAvailable } from "../identities/provider-compat.js";
import { searchQuery } from "../rank-snapshots/snapshot-capture.js";
import { withSnapshotBrowser } from "../rank-snapshots/snapshot-browser.js";
import { pickSnapshotIdentity } from "../rank-snapshots/snapshot-identity.js";
import { PROXY_POOL_DEFER_MINUTES } from "../scheduler/retry-policy.js";
import { ProxyPoolExhaustedError } from "../sessions/clean-lease.js";
import { addMinutes, randomBetween, sleep } from "../utils/helpers.js";
import { finaliseGridScan } from "./grid-summary.js";

const MAX_MOBILE_ATTEMPTS = 3;
const MAX_CONSECUTIVE_POINT_ERRORS = 2;
const POINT_ERROR_RETRY_MINUTES = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Phone search from each point: is the target in the results page's 3-pack? */
async function checkPoints(
  scan: GeoGridScan,
  points: GeoGridPoint[],
  experiment: Experiment,
  identity: Identity,
): Promise<"done" | "blocked" | "stuck"> {
  const businessName = experiment.gmbBusinessName?.trim();
  if (!businessName) throw new Error("GMB campaign has no business name");
  const centre = { latitude: scan.centreLatitude, longitude: scan.centreLongitude };
  return withSnapshotBrowser(identity, centre, async ({ page, egress }) => {
    let consecutiveErrors = 0;
    for (const [index, point] of points.entries()) {
      try {
        await setSearchLocation(page.context(), point);
        const blockReason = await searchQuery(page, scan.query, googleTargetFor(experiment.country));
        if (blockReason) throw new GoogleBlockedError(blockReason);
        await page.waitForTimeout(1500);
        const pack = (await collectMobilePackCandidates(page)).slice(0, 3);
        const match = matchCandidate(pack, { businessName, placeId: experiment.gmbPlaceId }, "local_pack");
        await prisma.geoGridPoint.update({
          where: { id: point.id },
          data: {
            mobilePackPosition: match?.position ?? null,
            mobileTopResultsJson: JSON.stringify(pack.map((candidate) => candidate.title)),
            mobileCheckedAt: new Date(),
          },
        });
        consecutiveErrors = 0;
      } catch (error) {
        if (error instanceof GoogleBlockedError) {
          await registerGoogleBlock(identity.id, egress?.ip);
          await prisma.geoGridScan.update({ where: { id: scan.id }, data: { errorMessage: `mobile: ${error.reason}` } });
          return "blocked";
        }
        logger.warn({ event: "geo_grid_mobile_point_failed", scanId: scan.id, pointId: point.id, error: errorMessage(error) });
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_POINT_ERRORS) return "stuck";
      }
      if (index < points.length - 1) await sleep(randomBetween(6_000, 15_000));
    }
    await registerGoogleClean(identity.id);
    return "done";
  });
}

async function retryOrFinish(scan: GeoGridScan, minutes: number, message: string): Promise<void> {
  const remaining = await prisma.geoGridPoint.count({ where: { scanId: scan.id, mobileCheckedAt: null } });
  if (remaining === 0 || scan.mobileAttemptCount + 1 >= MAX_MOBILE_ATTEMPTS) {
    await finaliseGridScan(scan.id, true);
    return;
  }
  await prisma.geoGridScan.update({
    where: { id: scan.id },
    data: { status: "pending", scheduledAt: addMinutes(new Date(), minutes), errorMessage: message },
  });
}

/** Desktop points settled: the scan goes back to the queue as its own job so sessions can run in between. */
export async function queueMobilePass(scanId: string): Promise<void> {
  await prisma.geoGridScan.update({
    where: { id: scanId },
    data: { status: "pending", scheduledAt: new Date(), errorMessage: null },
  });
}

/** Second pass after the desktop points settle; skipped (scan finalised) without a mobile identity. */
export async function runMobilePass(scan: GeoGridScan & { experiment: Experiment }): Promise<void> {
  const points = await prisma.geoGridPoint.findMany({
    where: { scanId: scan.id, mobileCheckedAt: null },
    orderBy: [{ row: "asc" }, { col: "asc" }],
  });
  const identity =
    points.length > 0 && mobileIdentitiesAvailable()
      ? await pickSnapshotIdentity(scan.experiment, undefined, "mobile")
      : null;
  if (!identity) {
    if (points.length > 0) logger.warn({ event: "geo_grid_mobile_skipped", scanId: scan.id, reason: "no mobile identity" });
    await finaliseGridScan(scan.id, true);
    return;
  }

  await prisma.geoGridScan.update({
    where: { id: scan.id },
    data: { status: "running", mobileIdentityExternalId: identity.externalId },
  });
  try {
    const outcome = await checkPoints(scan, points, scan.experiment, identity);
    await prisma.geoGridScan.update({ where: { id: scan.id }, data: { mobileAttemptCount: { increment: 1 } } });
    if (outcome === "blocked") await retryOrFinish(scan, BLOCK_RETRY_DELAY_MINUTES, "mobile pass blocked");
    else await retryOrFinish(scan, POINT_ERROR_RETRY_MINUTES, "mobile points failed; resuming in a fresh browser");
  } catch (error) {
    if (error instanceof ProxyPoolExhaustedError) {
      await prisma.geoGridScan.update({
        where: { id: scan.id },
        data: { status: "pending", scheduledAt: addMinutes(new Date(), PROXY_POOL_DEFER_MINUTES) },
      });
      return;
    }
    await prisma.geoGridScan.update({ where: { id: scan.id }, data: { mobileAttemptCount: { increment: 1 } } });
    await retryOrFinish(scan, BLOCK_RETRY_DELAY_MINUTES, errorMessage(error));
    logger.error({ event: "geo_grid_mobile_pass_failed", scanId: scan.id, error: errorMessage(error) });
  }
  logger.info({ event: "geo_grid_mobile_pass_processed", scanId: scan.id, points: points.length, identity: identity.externalId });
}
