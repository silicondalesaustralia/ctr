#!/usr/bin/env node
/**
 * Keep only au_055–au_074 active; disable everything else and cancel warmups.
 * Usage: npm run identities:keep-cohort -- --confirm
 */
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { getEnv } from "../src/config/env.js";
import { prisma } from "../src/db/client.js";

const KEEP_RE = /^au_0(5[5-9]|6[0-9]|7[0-4])$/;

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm");
  }

  const all = await prisma.identity.findMany({ orderBy: { externalId: "asc" } });
  const keep = all.filter((i) => KEEP_RE.test(i.externalId));
  const drop = all.filter((i) => !KEEP_RE.test(i.externalId) && i.active);

  for (const identity of drop) {
    await prisma.identity.update({
      where: { id: identity.id },
      data: { active: false },
    });
  }

  // Cancel ALL pending warmups (including keep cohort) so proxy fixes can land first.
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

  const stillActive = await prisma.identity.count({ where: { active: true } });
  console.log(`Disabled ${drop.length} identities outside au_055–074`);
  console.log(`Kept ${keep.length} cohort identities active=${stillActive}`);
  console.log(`Cancelled ${cancelled.count} warmup sessions (pause until proxy fixed)`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
