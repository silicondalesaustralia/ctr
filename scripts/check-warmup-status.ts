#!/usr/bin/env node
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";

async function main() {
  const identities = await prisma.identity.findMany({ orderBy: { externalId: "asc" } });
  console.log("=== IDENTITIES ===");
  for (const identity of identities) {
    console.log(
      `${identity.externalId} warmup=${identity.warmupStatus} completed=${identity.warmupSessionsCompleted} clicks=${identity.warmupSiteClicks} google=${identity.googleSessions}`,
    );
  }

  const warmupByStatus = await prisma.warmupSession.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\n=== WARMUP SESSIONS BY STATUS ===", warmupByStatus);

  const due = await prisma.warmupSession.count({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
  });
  const future = await prisma.warmupSession.count({
    where: { status: "scheduled", scheduledAt: { gt: new Date() } },
  });
  console.log(`Due now: ${due}, Future scheduled: ${future}`);

  const sample = await prisma.warmupSession.findMany({
    take: 8,
    orderBy: { scheduledAt: "asc" },
    include: { identity: { select: { externalId: true } } },
  });
  console.log("\n=== SAMPLE WARMUP SESSIONS ===");
  for (const session of sample) {
    console.log(
      `${session.identity.externalId} ${session.status} at=${session.scheduledAt.toISOString()} attempts=${session.attemptCount}`,
    );
  }

  const warmupExperiment = await prisma.session.count({
    where: { experiment: { slug: "__warmup__" } },
  });
  console.log(`\nWarmup experiment sessions logged: ${warmupExperiment}`);

  const recentCampaign = await prisma.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      status: true,
      createdAt: true,
      identity: { select: { externalId: true } },
      experiment: { select: { name: true } },
    },
  });
  console.log("\n=== RECENT CAMPAIGN SESSIONS ===");
  for (const session of recentCampaign) {
    console.log(
      `${session.identity.externalId} ${session.status} created=${session.createdAt.toISOString()} campaign=${session.experiment.name}`,
    );
  }

  const sessionByStatus = await prisma.session.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log("\nSession table:", sessionByStatus);

  const scheduledCampaign = await prisma.scheduledSession.count({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
  });
  const scheduledByStatus = await prisma.scheduledSession.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log(`Due campaign scheduled sessions: ${scheduledCampaign}`);
  console.log("ScheduledSession table:", scheduledByStatus);

  const redisUrl = getEnv().REDIS_URL;
  if (!process.argv.includes("--skip-redis")) {
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    try {
      await redis.connect();
      const warmupQueue = new Queue("warmup-jobs", { connection: redis });
      const sessionQueue = new Queue("session-jobs", { connection: redis });

      const [warmupWaiting, warmupActive, sessionWaiting, sessionActive] = await Promise.all([
        warmupQueue.getWaitingCount(),
        warmupQueue.getActiveCount(),
        sessionQueue.getWaitingCount(),
        sessionQueue.getActiveCount(),
      ]);
      console.log("\n=== BULLMQ QUEUES ===");
      console.log(`warmup-jobs: waiting=${warmupWaiting} active=${warmupActive}`);
      console.log(`session-jobs: waiting=${sessionWaiting} active=${sessionActive}`);

      await warmupQueue.close();
      await sessionQueue.close();
    } catch (error) {
      console.log("\n=== BULLMQ QUEUES ===");
      console.log(`Could not reach Redis (${String(error)}). Worker queue state unknown.`);
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
