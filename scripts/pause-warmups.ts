#!/usr/bin/env node
/**
 * Cancel all pending warmups and drain queues — keep identities as-is.
 * Usage: npm run warmup:pause -- --confirm
 */
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm");
  }

  const cancelled = await prisma.warmupSession.updateMany({
    where: { status: { in: ["scheduled", "running"] } },
    data: { status: "cancelled" },
  });

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
      await queue.close();
      console.log(`Drained ${name}`);
    }
  } finally {
    await redis.quit().catch(() => undefined);
  }

  const left = await prisma.warmupSession.count({
    where: { status: "scheduled", identity: { active: true } },
  });
  console.log(`Cancelled ${cancelled.count} warmup sessions; scheduled left=${left}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
