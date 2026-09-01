import { Queue, Worker, type Job } from "bullmq";
import { createRedisConnection } from "../config/redis.js";
import { prisma } from "../db/client.js";
import { runWarmupSession } from "../sessions/warmup-runner.js";
import { logger } from "../config/logger.js";

const QUEUE_NAME = "warmup-jobs";

let connection: ReturnType<typeof createRedisConnection> | null = null;
let queue: Queue | null = null;

function getConnection() {
  if (!connection) {
    connection = createRedisConnection();
  }
  return connection;
}

export function getWarmupQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return queue;
}

export interface WarmupJobData {
  warmupSessionId: string;
}

export async function enqueueWarmupSession(warmupSessionId: string): Promise<void> {
  const warmupQueue = getWarmupQueue();
  await warmupQueue.add(
    "run-warmup",
    { warmupSessionId },
    { jobId: warmupSessionId, removeOnComplete: true, removeOnFail: false },
  );
}

export async function processWarmupSession(warmupSessionId: string): Promise<void> {
  const warmup = await prisma.warmupSession.findUnique({
    where: { id: warmupSessionId },
    include: { identity: true },
  });

  if (!warmup || warmup.status !== "scheduled") return;
  if (!warmup.identity.active) return;

  await prisma.warmupSession.update({
    where: { id: warmupSessionId },
    data: { status: "running", attemptCount: { increment: 1 } },
  });

  try {
    const result = await runWarmupSession({
      identity: warmup.identity,
      queryText: warmup.queryText,
      warmupSessionId: warmup.id,
      kind: warmup.kind,
    });

    const infraFailure =
      result.status === "proxy_error" ||
      result.status === "browser_error" ||
      result.status === "gologin_parallel_limit";

    if (infraFailure) {
      await prisma.warmupSession.update({
        where: { id: warmupSessionId },
        data: {
          status: "scheduled",
          sessionId: result.sessionId,
          scheduledAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      logger.info({
        event: "warmup_session_retry_scheduled",
        warmupSessionId,
        identityId: warmup.identity.externalId,
        kind: warmup.kind,
        result: result.status,
      });
      return;
    }

    const succeeded =
      result.status === "completed" &&
      (warmup.kind === "graduation" || result.siteClicked);

    await prisma.warmupSession.update({
      where: { id: warmupSessionId },
      data: {
        status: succeeded ? "completed" : "failed",
        sessionId: result.sessionId,
      },
    });

    logger.info({
      event: "warmup_session_processed",
      warmupSessionId,
      identityId: warmup.identity.externalId,
      kind: warmup.kind,
      result: result.status,
      siteClicked: result.siteClicked,
      succeeded,
    });
  } catch (error) {
    await prisma.warmupSession.update({
      where: { id: warmupSessionId },
      data: { status: "scheduled" },
    });
    throw error;
  }
}

export function createWarmupWorker(): Worker<WarmupJobData> {
  return new Worker<WarmupJobData>(
    QUEUE_NAME,
    async (job: Job<WarmupJobData>) => {
      await processWarmupSession(job.data.warmupSessionId);
    },
    {
      connection: getConnection(),
      concurrency: 1,
    },
  );
}

export async function pollAndEnqueueDueWarmupSessions(): Promise<number> {
  const due = await prisma.warmupSession.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      identity: { active: true, warmupStatus: "warming" },
    },
    take: 5,
  });

  for (const item of due) {
    await enqueueWarmupSession(item.id);
  }

  return due.length;
}