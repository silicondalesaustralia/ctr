import { Queue, Worker, type Job } from "bullmq";
import { isRunnerEnabledAsync } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createRedisConnection } from "../config/redis.js";
import { prisma } from "../db/client.js";
import { BULLMQ_JOB_LOCK_MS, BULLMQ_STALLED_INTERVAL_MS } from "../scheduler/bullmq-options.js";
import { withBrowserJobExclusive } from "../scheduler/browser-job-mutex.js";
import { runGridScan } from "./grid-runner.js";
import { queueDueGridScans } from "./grid-triggers.js";

const QUEUE_NAME = "geo-grid-jobs";

let connection: ReturnType<typeof createRedisConnection> | null = null;
let queue: Queue | null = null;

function getConnection() {
  if (!connection) connection = createRedisConnection();
  return connection;
}

function getGridQueue(): Queue {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  return queue;
}

export interface GridJobData {
  scanId: string;
}

export function createGridWorker(): Worker<GridJobData> {
  return new Worker<GridJobData>(
    QUEUE_NAME,
    async (job: Job<GridJobData>) => {
      await withBrowserJobExclusive(() => runGridScan(job.data.scanId));
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

/** Scheduled scans only appear while the runner is on; manual scans always run. */
export async function pollAndEnqueueDueGridScans(): Promise<number> {
  if (await isRunnerEnabledAsync()) {
    const queued = await queueDueGridScans();
    if (queued > 0) logger.info({ event: "geo_grid_scans_queued", count: queued });
  }
  const due = await prisma.geoGridScan.findMany({
    where: { status: "pending", scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const { id } of due) await enqueueGridJob(id);
  return due.length;
}

/**
 * A job left active by a killed worker keeps its lock (BULLMQ_JOB_LOCK_MS) and would block a
 * same-id re-add, so ids are per boot. A stale job that runs later finds the scan not pending and exits.
 */
const BOOT_ID = Date.now().toString(36);

/** No-op while a job for this scan is already waiting or running in this worker. */
export async function enqueueGridJob(scanId: string): Promise<void> {
  await getGridQueue().add(
    "run-geo-grid",
    { scanId },
    { jobId: `geo-grid-${scanId}-${BOOT_ID}`, removeOnComplete: true, removeOnFail: true },
  );
}
