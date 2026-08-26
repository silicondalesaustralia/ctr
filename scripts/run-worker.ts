#!/usr/bin/env node
import { createSessionWorker, pollAndEnqueueDueSessions } from "../src/scheduler/worker.js";
import { logger } from "../src/config/logger.js";

const worker = createSessionWorker();

worker.on("completed", (job) => {
  logger.info({ event: "worker_job_completed", jobId: job.id });
});

worker.on("failed", (job, err) => {
  logger.error({ event: "worker_job_failed", jobId: job?.id, error: err.message });
});

async function pollLoop(): Promise<void> {
  const count = await pollAndEnqueueDueSessions();
  if (count > 0) {
    logger.info({ event: "due_sessions_enqueued", count });
  }
}

setInterval(() => {
  pollLoop().catch((error) => logger.error({ event: "poll_failed", error: String(error) }));
}, 60000);

pollLoop().catch((error) => logger.error({ event: "poll_failed", error: String(error) }));
console.log("Session worker started with concurrency=1");
