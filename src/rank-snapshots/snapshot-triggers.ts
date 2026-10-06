import type { RankSnapshotKind } from "@prisma/client";
import { prisma } from "../db/client.js";
import {
  getCalendarDateInTimezone,
  localHourMinute,
  parseTimeToMinutes,
} from "../utils/helpers.js";

const DAILY_DELAY_AFTER_END_MINUTES = 30;
const LATEST_DAILY_MINUTE = 23 * 60 + 55;

export function localDateString(instant: Date, timeZone: string): string {
  const { year, month, day } = getCalendarDateInTimezone(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minute of the local day when the end-of-day snapshot becomes due. */
export function dailyDueMinute(scheduleEnd: string): number {
  return Math.min(parseTimeToMinutes(scheduleEnd) + DAILY_DELAY_AFTER_END_MINUTES, LATEST_DAILY_MINUTE);
}

async function insertPending(
  experimentId: string,
  queries: string[],
  kind: RankSnapshotKind,
  localDate: string,
): Promise<number> {
  if (queries.length === 0) return 0;
  const result = await prisma.rankSnapshot.createMany({
    data: queries.map((query) => ({ experimentId, query, kind, localDate })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Baseline for any active query that has none yet; end-of-day snapshot once the local day is done. */
export async function queueDueSnapshots(now = new Date()): Promise<number> {
  const experiments = await prisma.experiment.findMany({
    where: { status: "active" },
    include: { queries: { where: { active: true }, select: { query: true } } },
  });

  let queued = 0;
  for (const experiment of experiments) {
    const queries = experiment.queries.map((row) => row.query);
    const localDate = localDateString(now, experiment.scheduleTimezone);

    const baselined = await prisma.rankSnapshot.findMany({
      where: { experimentId: experiment.id, kind: "baseline" },
      select: { query: true },
    });
    const hasBaseline = new Set(baselined.map((row) => row.query));
    queued += await insertPending(
      experiment.id,
      queries.filter((query) => !hasBaseline.has(query)),
      "baseline",
      localDate,
    );

    const { hour, minute } = localHourMinute(now, experiment.scheduleTimezone);
    if (hour * 60 + minute >= dailyDueMinute(experiment.scheduleEnd)) {
      queued += await insertPending(experiment.id, queries, "daily", localDate);
    }
  }
  return queued;
}

/** "Take snapshot now": today's manual row per active query (plus any failed baseline), due immediately. */
export async function queueManualSnapshots(experimentId: string): Promise<number> {
  const experiment = await prisma.experiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: { queries: { where: { active: true }, select: { query: true } } },
  });
  const queries = experiment.queries.map((row) => row.query);
  if (queries.length === 0) throw new Error("Campaign has no active queries to snapshot");

  const localDate = localDateString(new Date(), experiment.scheduleTimezone);
  const requeued = await prisma.rankSnapshot.updateMany({
    where: {
      experimentId,
      kind: "manual",
      localDate,
      query: { in: queries },
      status: { not: "running" },
    },
    data: { status: "pending", attemptCount: 0, scheduledAt: new Date(), errorMessage: null },
  });
  const retriedBaselines = await prisma.rankSnapshot.updateMany({
    where: { experimentId, kind: "baseline", query: { in: queries }, status: { in: ["error", "blocked"] } },
    data: { status: "pending", attemptCount: 0, scheduledAt: new Date(), errorMessage: null },
  });
  const inserted = await insertPending(experimentId, queries, "manual", localDate);
  return requeued.count + retriedBaselines.count + inserted;
}

/** "Update all positions": manual snapshots for every active campaign with active queries. */
export async function queueManualSnapshotsForActive(): Promise<string[]> {
  const experiments = await prisma.experiment.findMany({
    where: { status: "active", queries: { some: { active: true } } },
    select: { id: true },
  });
  for (const { id } of experiments) await queueManualSnapshots(id);
  return experiments.map(({ id }) => id);
}
