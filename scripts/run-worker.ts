#!/usr/bin/env node
import { createSessionWorker, pollAndEnqueueDueSessions } from "../src/scheduler/worker.js";
import {
  createWarmupWorker,
  pollAndEnqueueDueWarmupSessions,
} from "../src/scheduler/warmup-worker.js";
import { cleanupStaleSessions } from "../src/sessions/session-cleanup.js";
import { logger } from "../src/config/logger.js";
import { prisma } from "../src/db/client.js";
import { maybeRecalculateAdaptivePacing } from "../src/campaign/adaptive-pacing.js";
import { backfillWarmupForExistingIdentities, backfillCampaignWarmupRequirements } from "../src/warmup/warmup-service.js";
import { SERP_CLICK_STRATEGY } from "../src/browser/serp-parser.js";

const worker = createSessionWorker();
const warmupWorker = createWarmupWorker();

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

setInterval(() => {
  pollLoop().catch((error) => logger.error({ event: "poll_failed", error: String(error) }));
}, 60000);

pollLoop().catch((error) => logger.error({ event: "poll_failed", error: String(error) }));

backfillWarmupForExistingIdentities()
  .then((count) => {
    if (count > 0) {
      logger.info({ event: "warmup_backfill_scheduled", sessions: count });
    }
  })
  .catch((error) => logger.error({ event: "warmup_backfill_failed", error: String(error) }));

backfillCampaignWarmupRequirements()
  .then((count) => {
    if (count > 0) {
      logger.info({ event: "campaign_warmup_requirement_backfill", campaigns: count });
    }
  })
  .catch((error) =>
    logger.error({ event: "campaign_warmup_backfill_failed", error: String(error) }),
  );

cleanupStaleSessions().catch((error) =>
  logger.error({ event: "stale_session_cleanup_failed", error: String(error) }),
);

console.log(
  `Session worker started with concurrency=1 (campaign + warmup queues) serp=${SERP_CLICK_STRATEGY} commit=${process.env.RAILWAY_GIT_COMMIT_SHA ?? "local"}`,
);
