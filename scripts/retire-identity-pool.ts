#!/usr/bin/env node
/**
 * Soft-retire the whole identity pool so a fresh cohort can be created.
 * Does not delete GoLogin profiles or DB rows — only disables + cancels work.
 *
 * Usage: npm run identities:retire-pool -- --confirm
 */
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";

async function drainQueues(): Promise<void> {
  const redis = new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 8000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    for (const name of ["warmup-jobs", "session-jobs"] as const) {
      const queue = new Queue(name, { connection: redis });
      await queue.obliterate({ force: true });
      console.log(`Drained BullMQ queue: ${name}`);
      await queue.close();
    }
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing to run without --confirm (disables ALL identities)");
  }

  const activeBefore = await prisma.identity.count({ where: { active: true } });
  const disabled = await prisma.identity.updateMany({
    where: { active: true },
    data: { active: false },
  });

  const warmups = await prisma.warmupSession.updateMany({
    where: { status: { in: ["scheduled", "running"] } },
    data: { status: "cancelled" },
  });

  const campaigns = await prisma.scheduledSession.updateMany({
    where: { status: "scheduled" },
    data: { status: "cancelled" },
  });

  console.log(`Disabled ${disabled.count} identities (was ${activeBefore} active)`);
  console.log(`Cancelled ${warmups.count} warmup sessions`);
  console.log(`Cancelled ${campaigns.count} scheduled campaign sessions`);

  if (!process.argv.includes("--skip-redis")) {
    await drainQueues();
  }

  const stillActive = await prisma.identity.count({ where: { active: true } });
  const stillScheduled = await prisma.warmupSession.count({
    where: { status: "scheduled" },
  });
  console.log(`Verify: active=${stillActive} scheduledWarmups=${stillScheduled}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
