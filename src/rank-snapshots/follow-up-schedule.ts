import type { Experiment } from "@prisma/client";
import { prisma } from "../db/client.js";
import { localDateString } from "./snapshot-triggers.js";

export const FOLLOWUP_DAYS = [7, 14, 30] as const;
/** A missed follow-up is only queued this long after it fell due, so old campaigns don't backfill. */
const FOLLOWUP_WINDOW_MS = 2 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** Stopped campaigns that may still owe a follow-up check (stopped within the last ~32 days). */
export async function recentlyStoppedCampaigns(now = new Date()): Promise<Experiment[]> {
  const horizon = new Date(now.getTime() - (Math.max(...FOLLOWUP_DAYS) * DAY_MS + FOLLOWUP_WINDOW_MS));
  return prisma.experiment.findMany({
    where: { status: { in: ["paused", "completed"] }, updatedAt: { gte: horizon } },
  });
}

/** Campaign end date if it has passed, else the start of its last session. */
export async function campaignStoppedAt(experiment: Experiment, now = new Date()): Promise<Date | null> {
  if (experiment.endDate && experiment.endDate <= now) return experiment.endDate;
  const last = await prisma.session.findFirst({
    where: { experimentId: experiment.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt ?? null;
}

/** Local dates of follow-ups that are due now (within their catch-up window). */
export function dueFollowupDates(stoppedAt: Date, now: Date, timeZone: string): string[] {
  return FOLLOWUP_DAYS.map((days) => new Date(stoppedAt.getTime() + days * DAY_MS))
    .filter((due) => now >= due && now.getTime() - due.getTime() <= FOLLOWUP_WINDOW_MS)
    .map((due) => localDateString(due, timeZone));
}
