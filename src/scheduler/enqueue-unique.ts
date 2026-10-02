import type { Queue } from "bullmq";

/**
 * Add a job keyed by its DB row id. BullMQ silently ignores add() while any job with that id
 * exists, and failed jobs are kept, so a row whose last run crashed (or was orphaned by a
 * worker restart) could never be queued again. Finished jobs are removed first; a job that is
 * still waiting or running is left alone.
 */
export async function addUniqueJob(
  queue: Queue,
  name: string,
  data: Record<string, string>,
  jobId: string,
): Promise<void> {
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "failed" && state !== "completed") return;
    await existing.remove();
  }
  await queue.add(name, data, { jobId, removeOnComplete: true, removeOnFail: false });
}
