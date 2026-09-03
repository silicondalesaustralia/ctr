import { Queue, Worker, type Job } from "bullmq";
import { isRunnerEnabledAsync } from "../config/env.js";
import { createRedisConnection } from "../config/redis.js";
import { prisma } from "../db/client.js";
import { runSession } from "../sessions/session-runner.js";
import { getRetryDelayMinutes, shouldRetry } from "./retry-policy.js";
import {
  BULLMQ_JOB_LOCK_MS,
  BULLMQ_STALLED_INTERVAL_MS,
} from "./bullmq-options.js";
import { addMinutes } from "../utils/helpers.js";
import { logger } from "../config/logger.js";

const QUEUE_NAME = "session-jobs";

let connection: ReturnType<typeof createRedisConnection> | null = null;
let queue: Queue | null = null;

function getConnection() {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

export function getSessionQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

export interface SessionJobData {
  scheduledSessionId: string;
}

export async function enqueueScheduledSession(scheduledSessionId: string): Promise<void> {
  const sessionQueue = getSessionQueue();
  await sessionQueue.add(
    "run-session",
    { scheduledSessionId },
    { jobId: scheduledSessionId, removeOnComplete: true, removeOnFail: false },
  );
}

export async function processScheduledSession(
  scheduledSessionId: string,
): Promise<void> {
  if (!(await isRunnerEnabledAsync())) {
    logger.warn({ event: "runner_disabled", scheduledSessionId });
    return;
  }

  const scheduled = await prisma.scheduledSession.findUnique({
    where: { id: scheduledSessionId },
    include: { experiment: true, identity: true, query: true },
  });

  if (!scheduled || scheduled.status !== "scheduled") return;

  await prisma.scheduledSession.update({
    where: { id: scheduledSessionId },
    data: { status: "running", attemptCount: { increment: 1 } },
  });

  try {
    const result = await runSession({
      experiment: scheduled.experiment,
      identity: scheduled.identity,
      queryText: scheduled.query.query,
      group: scheduled.group,
      scheduledSessionId: scheduled.id,
    });

    const terminalStatuses = new Set([
      "completed",
      "target_not_found",
      "search_abandoned",
      "target_found_no_click",
      "blocked",
      "browser_error",
      "google_error",
      "proxy_error",
      "target_error",
      "cancelled",
    ]);

    await prisma.scheduledSession.update({
      where: { id: scheduledSessionId },
      data: {
        status: terminalStatuses.has(result.status) ? "completed" : "scheduled",
      },
    });

    const retryKey =
      result.status === "blocked" && result.blockReason
        ? result.blockReason
        : (result.errorCode ?? result.status);
    if (shouldRetry(retryKey, scheduled.attemptCount + 1)) {
      const delay = getRetryDelayMinutes(retryKey);
      await prisma.scheduledSession.update({
        where: { id: scheduledSessionId },
        data: {
          status: "scheduled",
          scheduledAt: addMinutes(new Date(), delay),
        },
      });
    }

    logger.info({
      event: "scheduled_session_processed",
      scheduledSessionId,
      result: result.status,
      errorCode: result.errorCode,
      retryKey,
    });
  } catch (error) {
    await prisma.scheduledSession.update({
      where: { id: scheduledSessionId },
      data: { status: "scheduled" },
    });
    throw error;
  }
}

export function createSessionWorker(): Worker<SessionJobData> {
  return new Worker<SessionJobData>(
    QUEUE_NAME,
    async (job: Job<SessionJobData>) => {
      await processScheduledSession(job.data.scheduledSessionId);
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

export async function pollAndEnqueueDueSessions(): Promise<number> {
  if (!(await isRunnerEnabledAsync())) return 0;

  const due = await prisma.scheduledSession.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      experiment: { status: "active" },
    },
    take: 10,
  });

  for (const item of due) {
    await enqueueScheduledSession(item.id);
  }

  return due.length;
}
