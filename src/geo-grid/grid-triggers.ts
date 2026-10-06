import type { Experiment, GeoGridScanKind } from "@prisma/client";
import { prisma } from "../db/client.js";
import { rankCheckGeoPoint } from "../rank-snapshots/rank-check-point.js";
import {
  campaignStoppedAt,
  dueFollowupDates,
  recentlyStoppedCampaigns,
} from "../rank-snapshots/follow-up-schedule.js";
import { localDateString } from "../rank-snapshots/snapshot-triggers.js";
import { localHourMinute } from "../utils/helpers.js";
import { buildGridPoints, gridSettings } from "./grid-points.js";

/** Weekly scans start from this local hour, overnight before sessions begin. */
const WEEKLY_HOUR_START = 2;
const WEEKLY_HOUR_END = 6;
const WEEKLY_GAP_MS = 6 * 24 * 60 * 60_000;

async function activeQueries(experimentId: string): Promise<string[]> {
  const rows = await prisma.experimentQuery.findMany({
    where: { experimentId, active: true },
    select: { query: true },
  });
  return rows.map((row) => row.query);
}

/** Create a pending scan with its points; null when that scan already exists or has no centre. */
export async function createGridScan(
  experiment: Experiment,
  query: string,
  kind: GeoGridScanKind,
  localDate: string,
): Promise<string | null> {
  const centre = rankCheckGeoPoint(experiment);
  if (!centre) return null;
  const existing = await prisma.geoGridScan.findUnique({
    where: { experimentId_query_localDate_kind: { experimentId: experiment.id, query, localDate, kind } },
    select: { id: true },
  });
  if (existing) return null;

  const settings = gridSettings(experiment);
  const scan = await prisma.geoGridScan.create({
    data: {
      experimentId: experiment.id,
      query,
      kind,
      localDate,
      centreLatitude: centre.latitude,
      centreLongitude: centre.longitude,
      gridSize: settings.size,
      spacingKm: settings.spacingKm,
      points: { createMany: { data: buildGridPoints(centre, settings) } },
    },
    select: { id: true },
  });
  return scan.id;
}

async function queueActiveScans(experiment: Experiment, now: Date): Promise<number> {
  const localDate = localDateString(now, experiment.scheduleTimezone);
  const { hour } = localHourMinute(now, experiment.scheduleTimezone);
  const overnight = hour >= WEEKLY_HOUR_START && hour < WEEKLY_HOUR_END;
  let queued = 0;
  for (const query of await activeQueries(experiment.id)) {
    const latest = await prisma.geoGridScan.findFirst({
      where: { experimentId: experiment.id, query },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const kind: GeoGridScanKind | null = !latest
      ? "baseline"
      : overnight && now.getTime() - latest.createdAt.getTime() >= WEEKLY_GAP_MS
        ? "weekly"
        : null;
    if (kind && (await createGridScan(experiment, query, kind, localDate))) queued += 1;
  }
  return queued;
}

async function queueFollowupScans(experiment: Experiment, now: Date): Promise<number> {
  const stoppedAt = await campaignStoppedAt(experiment, now);
  if (!stoppedAt) return 0;
  let queued = 0;
  for (const localDate of dueFollowupDates(stoppedAt, now, experiment.scheduleTimezone)) {
    for (const query of await activeQueries(experiment.id)) {
      if (await createGridScan(experiment, query, "followup", localDate)) queued += 1;
    }
  }
  return queued;
}

/** Baseline at start, weekly overnight while active, follow-ups after stop (GMB campaigns only). */
export async function queueDueGridScans(now = new Date()): Promise<number> {
  const active = await prisma.experiment.findMany({ where: { status: "active", campaignKind: "gmb" } });
  let queued = 0;
  for (const experiment of active) queued += await queueActiveScans(experiment, now);
  const stopped = (await recentlyStoppedCampaigns(now)).filter((experiment) => experiment.campaignKind === "gmb");
  for (const experiment of stopped) queued += await queueFollowupScans(experiment, now);
  return queued;
}

/** "Run grid now": today's manual scan per active query, re-run if one already exists. */
export async function queueManualGridScans(experimentId: string): Promise<number> {
  const experiment = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  if (experiment.campaignKind !== "gmb") throw new Error("Coverage grids are for GMB campaigns only");
  const queries = await activeQueries(experimentId);
  if (queries.length === 0) throw new Error("Campaign has no active queries to scan");
  const localDate = localDateString(new Date(), experiment.scheduleTimezone);
  await prisma.geoGridScan.deleteMany({
    where: { experimentId, kind: "manual", localDate, query: { in: queries }, status: { not: "running" } },
  });
  let queued = 0;
  for (const query of queries) {
    if (await createGridScan(experiment, query, "manual", localDate)) queued += 1;
  }
  return queued;
}
