import { prisma } from "../db/client.js";
import { campaignStoppedAt, dueFollowupDates, recentlyStoppedCampaigns } from "./follow-up-schedule.js";
import { insertPending } from "./snapshot-triggers.js";

/** Rank checks at +7, +14 and +30 days after a campaign stops, to see whether gains hold. */
export async function queueFollowupSnapshots(now = new Date()): Promise<number> {
  let queued = 0;
  for (const experiment of await recentlyStoppedCampaigns(now)) {
    const stoppedAt = await campaignStoppedAt(experiment, now);
    if (!stoppedAt) continue;
    const dates = dueFollowupDates(stoppedAt, now, experiment.scheduleTimezone);
    if (dates.length === 0) continue;
    const queries = await prisma.experimentQuery.findMany({
      where: { experimentId: experiment.id, active: true },
      select: { query: true },
    });
    for (const localDate of dates) {
      queued += await insertPending(experiment, queries.map((row) => row.query), "followup", localDate);
    }
  }
  return queued;
}
