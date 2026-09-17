#!/usr/bin/env node
import { prisma } from "../src/db/client.js";

async function main() {
  const since = new Date("2026-09-17T02:00:00.000Z");
  const sessions = await prisma.session.findMany({
    where: {
      createdAt: { gte: since },
      experiment: { slug: "__warmup__" },
      identity: { active: true },
    },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      blockReason: true,
      errorCode: true,
      errorMessage: true,
      googleLoaded: true,
      proxyCountry: true,
      proxyCity: true,
      createdAt: true,
      identity: { select: { externalId: true } },
    },
  });

  console.log("=== TODAY'S COHORT SESSIONS ===");
  for (const s of sessions) {
    console.log(
      `${s.createdAt.toISOString()} ${s.identity.externalId} ${s.status}` +
        ` geo=${s.proxyCountry ?? "?"}/${s.proxyCity ?? "?"}` +
        ` googleLoaded=${s.googleLoaded}` +
        ` block=${s.blockReason ?? "-"}` +
        ` err=${(s.errorMessage ?? s.errorCode ?? "-").slice(0, 120)}`,
    );
  }

  const future = await prisma.warmupSession.findMany({
    where: { status: "scheduled", identity: { active: true } },
    orderBy: { scheduledAt: "asc" },
    include: { identity: { select: { externalId: true } } },
  });
  console.log(`\nFuture scheduled (active): ${future.length}`);
  for (const s of future.slice(0, 8)) {
    const h = ((s.scheduledAt.getTime() - Date.now()) / 3_600_000).toFixed(1);
    console.log(`  ${s.identity.externalId} ${s.kind} in ${h}h ${s.scheduledAt.toISOString()}`);
  }

  const failedToday = await prisma.warmupSession.count({
    where: {
      status: "failed",
      createdAt: { gte: since },
      identity: { active: true },
    },
  });
  console.log(`Failed warmup rows since wave: ${failedToday}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
