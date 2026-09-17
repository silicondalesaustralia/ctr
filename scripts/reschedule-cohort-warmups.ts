#!/usr/bin/env node
/**
 * Re-schedule warmups for active au_055–au_074 after a pause.
 * Skips the cold 36h first-delay (profiles already aged).
 *
 * Usage: npm run warmup:reschedule-cohort -- --confirm
 */
const KEEP_RE = /^au_0(5[5-9]|6[0-9]|7[0-4])$/;

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm");
  }

  // Must set before importing warmup-config (module reads env at load).
  process.env.WARMUP_FIRST_DELAY_HOURS = process.env.WARMUP_FIRST_DELAY_HOURS || "2";
  process.env.WARMUP_SPREAD_DAYS = process.env.WARMUP_SPREAD_DAYS || "5";

  const { prisma } = await import("../src/db/client.js");
  const { rebuildWarmupSchedule } = await import("../src/warmup/warmup-service.js");

  try {
    const identities = await prisma.identity.findMany({
      where: { active: true },
      orderBy: { externalId: "asc" },
    });

    const cohort = identities.filter((i) => KEEP_RE.test(i.externalId));
    if (cohort.length === 0) {
      throw new Error("No active au_055–au_074 identities found");
    }

    let scheduled = 0;
    for (const identity of cohort) {
      const n = await rebuildWarmupSchedule(identity);
      scheduled += n;
      console.log(`${identity.externalId}: scheduled ${n} warmup session(s)`);
    }

    const next = await prisma.warmupSession.findMany({
      where: { status: "scheduled", identity: { active: true } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: { identity: { select: { externalId: true } } },
    });

    console.log(`\nTotal scheduled rows: ${scheduled} across ${cohort.length} identities`);
    console.log(
      `FIRST_DELAY=${process.env.WARMUP_FIRST_DELAY_HOURS}h SPREAD=${process.env.WARMUP_SPREAD_DAYS}d`,
    );
    const now = Date.now();
    for (const s of next) {
      const h = ((s.scheduledAt.getTime() - now) / 3_600_000).toFixed(1);
      console.log(
        `  next ${s.identity.externalId} ${s.kind} in ${h}h (${s.scheduledAt.toISOString()})`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
