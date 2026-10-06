#!/usr/bin/env node
import { createSessionWorker, pollAndEnqueueDueSessions } from "../src/scheduler/worker.js";
import {
  createWarmupWorker,
  pollAndEnqueueDueWarmupSessions,
} from "../src/scheduler/warmup-worker.js";
import { cleanupStaleSessions } from "../src/sessions/session-cleanup.js";
import { killOrphanBrowserProcesses, logWorkerMemory } from "../src/providers/browser/orphan-browsers.js";
import { sweepProfileDisk } from "../src/providers/browser/profile-disk.js";
import { logger } from "../src/config/logger.js";
import { prisma } from "../src/db/client.js";
import { maybeRecalculateAdaptivePacing } from "../src/campaign/adaptive-pacing.js";
import { backfillWarmupForExistingIdentities } from "../src/warmup/warmup-service.js";
import { runWarmPoolTick } from "../src/warmup/warm-pool.js";
import { SERP_CLICK_STRATEGY } from "../src/browser/serp-parser.js";
import { createSnapshotWorker, pollAndEnqueueDueSnapshots } from "../src/rank-snapshots/snapshot-queue.js";
import { resetStrandedSnapshots } from "../src/rank-snapshots/snapshot-runner.js";
import { createGridWorker, pollAndEnqueueDueGridScans } from "../src/geo-grid/grid-queue.js";
import { resetStrandedGridScans } from "../src/geo-grid/grid-runner.js";
import { failStrandedPreflightJobs, pollPreflightJobs } from "../src/scheduler/preflight-worker.js";

// OOM kills leave Orbita/Chrome behind; clear before accepting jobs.
killOrphanBrowserProcesses("worker-boot");
logWorkerMemory("worker-boot");

// Before any job starts: no browser may hold a profile while its caches are removed.
try {
  await sweepProfileDisk();
} catch (error) {
  logger.error({ event: "profile_disk_sweep_failed", error: String(error) });
}

const worker = createSessionWorker();
const warmupWorker = createWarmupWorker();
const snapshotWorker = createSnapshotWorker();

snapshotWorker.on("failed", (job, err) => {
  logger.error({ event: "rank_snapshot_job_failed", jobId: job?.id, error: err.message });
});

const gridWorker = createGridWorker();
gridWorker.on("failed", (job, err) => {
  logger.error({ event: "geo_grid_job_failed", jobId: job?.id, error: err.message });
});

worker.on("completed", (job) => {
  logger.info({ event: "worker_job_completed", jobId: job.id });
});

worker.on("failed", (job, err) => {
  logger.error({ event: "worker_job_failed", jobId: job?.id, error: err.message });
});

warmupWorker.on("completed", (job) => {
  logger.info({ event: "warmup_job_completed", jobId: job.id });
});

warmupWorker.on("failed", (job, err) => {
  logger.error({ event: "warmup_job_failed", jobId: job?.id, error: err.message });
});

async function pollLoop(): Promise<void> {
  const count = await pollAndEnqueueDueSessions();
  if (count > 0) {
    logger.info({ event: "due_sessions_enqueued", count });
  }

  const warmupCount = await pollAndEnqueueDueWarmupSessions();
  if (warmupCount > 0) {
    logger.info({ event: "due_warmup_sessions_enqueued", count: warmupCount });
  }

  try {
    const snapshotCampaigns = await pollAndEnqueueDueSnapshots();
    if (snapshotCampaigns > 0) {
      logger.info({ event: "rank_snapshot_jobs_enqueued", campaigns: snapshotCampaigns });
    }
  } catch (error) {
    logger.error({ event: "rank_snapshot_poll_failed", error: String(error) });
  }

  try {
    const gridScans = await pollAndEnqueueDueGridScans();
    if (gridScans > 0) logger.info({ event: "geo_grid_jobs_enqueued", scans: gridScans });
  } catch (error) {
    logger.error({ event: "geo_grid_poll_failed", error: String(error) });
  }

  const activeExperiments = await prisma.experiment.findMany({
    where: { status: "active", adaptivePacing: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const experiment of activeExperiments) {
    const recalculated = await maybeRecalculateAdaptivePacing(experiment.id);
    if (recalculated) {
      logger.info({ event: "adaptive_pacing_recalculated", experimentId: experiment.id });
    }
  }
}

const POLL_MS = 60_000;
const STALE_CLEANUP_MS = 5 * 60_000;

setInterval(() => {
  pollLoop().catch((error) => logger.error({ event: "poll_failed", error: String(error) }));
}, POLL_MS);

setInterval(() => {
  cleanupStaleSessions()
    .then(async () => {
      const { forceReleaseGoLoginSlot } = await import(
        "../src/providers/browser/gologin-slot-lock.js"
      );
      // Slot TTL is 25m; only force-clear when nothing is actually running.
      const running = await prisma.session.count({ where: { status: "running" } });
      if (running === 0) {
        await forceReleaseGoLoginSlot();
      }
    })
    .catch((error) => logger.error({ event: "stale_session_cleanup_failed", error: String(error) }));
}, STALE_CLEANUP_MS);

Promise.all([resetStrandedSnapshots(), resetStrandedGridScans()])
  .catch((error) => logger.error({ event: "rank_snapshot_reset_failed", error: String(error) }))
  .finally(() => {
    pollLoop().catch((error) => logger.error({ event: "poll_failed", error: String(error) }));
  });

backfillWarmupForExistingIdentities()
  .then((count) => {
    if (count > 0) {
      logger.info({ event: "warmup_backfill_scheduled", sessions: count });
    }
  })
  .catch((error) => logger.error({ event: "warmup_backfill_failed", error: String(error) }));

const PREFLIGHT_POLL_MS = 5_000;
failStrandedPreflightJobs()
  .catch((error) => logger.error({ event: "preflight_stranded_reset_failed", error: String(error) }))
  .finally(() => setInterval(() => void pollPreflightJobs(), PREFLIGHT_POLL_MS));

const WARM_POOL_TICK_MS = 60 * 60_000;
setInterval(() => void runWarmPoolTick(), WARM_POOL_TICK_MS);
void runWarmPoolTick();

cleanupStaleSessions().catch((error) =>
  logger.error({ event: "stale_session_cleanup_failed", error: String(error) }),
);

console.log(
  `Session worker started with concurrency=1 lock=45m (campaign + warmup queues) serp=${SERP_CLICK_STRATEGY} commit=${process.env.RAILWAY_GIT_COMMIT_SHA ?? "local"}`,
);
