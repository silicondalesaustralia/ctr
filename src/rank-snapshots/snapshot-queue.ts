import { Queue, Worker, type Job } from "bullmq";
import { isRunnerEnabledAsync } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createRedisConnection } from "../config/redis.js";
import { prisma } from "../db/client.js";
import { BULLMQ_JOB_LOCK_MS, BULLMQ_STALLED_INTERVAL_MS } from "../scheduler/bullmq-options.js";
import { withBrowserJobExclusive } from "../scheduler/browser-job-mutex.js";
import { runExperimentSnapshots } from "./snapshot-runner.js";
import { queueDueSnapshots } from "./snapshot-triggers.js";

const QUEUE_NAME = "rank-snapshot-jobs";

let connection: ReturnType<typeof createRedisConnection> | null = null;
let queue: Queue | null = null;

function getConnection() {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

function getSnapshotQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

export interface SnapshotJobData {
  experimentId: string;
}

export function createSnapshotWorker(): Worker<SnapshotJobData> {
  return new Worker<SnapshotJobData>(
    QUEUE_NAME,
    async (job: Job<SnapshotJobData>) => {
      await withBrowserJobExclusive(() => runExperimentSnapshots(job.data.experimentId));
    },
    {
      connection: getConnection(),
      concurrency: 1,
      lockDuration: BULLMQ_JOB_LOCK_MS,
      stalledInterval: BULLMQ_STALLED_INTERVAL_MS,
      maxStalledCount: 1,
    },
  );
}

/**
 * Baseline/daily rows only appear while the runner is on; manual rows from the
 * dashboard are always processed. One job per campaign covers all its due rows.
 */
export async function pollAndEnqueueDueSnapshots(): Promise<number> {
  if (await isRunnerEnabledAsync()) {
    const queued = await queueDueSnapshots();
    if (queued > 0) logger.info({ event: "rank_snapshots_queued", count: queued });
  }

  const due = await prisma.rankSnapshot.findMany({
    where: { status: "pending", scheduledAt: { lte: new Date() } },
    distinct: ["experimentId"],
    select: { experimentId: true },
  });

  for (const { experimentId } of due) {
    await getSnapshotQueue().add(
      "run-rank-snapshots",
      { experimentId },
      { jobId: `rank-snapshot-${experimentId}`, removeOnComplete: true, removeOnFail: true },
    );
  }
  return due.length;
}
