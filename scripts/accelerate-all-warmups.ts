#!/usr/bin/env node
import { prisma } from "../src/db/client.js";
import { WARMUP_WINDOW_HOURS } from "../src/warmup/warmup-config.js";
import { prepareWarmupPool } from "../src/warmup/warmup-service.js";

function parseWindowHours(): number {
  const flag = process.argv.find((arg) => arg.startsWith("--window-hours="));
  if (!flag) return WARMUP_WINDOW_HOURS;
  const parsed = Number(flag.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : WARMUP_WINDOW_HOURS;
}

async function main() {
  const windowHours = parseWindowHours();
  console.log(`Rebuilding warmup schedules and interleaving over ${windowHours}h...`);

  const { scheduled, interleaved } = await prepareWarmupPool(windowHours);
  console.log(`Rebuilt ${scheduled} warmup slot(s) across warming identities.`);
  console.log(`Interleaved ${interleaved} pending warmup session(s).`);

  const warming = await prisma.identity.count({ where: { warmupStatus: "warming" } });
  const eligible = await prisma.identity.count({ where: { warmupStatus: "eligible" } });
  const pending = await prisma.warmupSession.count({ where: { status: "scheduled" } });

  console.log(`\nPool: warming=${warming} eligible=${eligible} pendingWarmups=${pending}`);

  const sample = await prisma.warmupSession.findMany({
    take: 12,
    orderBy: { scheduledAt: "asc" },
    include: { identity: { select: { externalId: true } } },
  });

  console.log("\nNext warmup sessions:");
  for (const session of sample) {
    console.log(
      `  ${session.scheduledAt.toISOString()} ${session.identity.externalId} ${session.kind} "${session.queryText}"`,
    );
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
