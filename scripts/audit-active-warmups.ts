#!/usr/bin/env node
import { prisma } from "../src/db/client.js";

async function main() {
  const active = await prisma.identity.findMany({
    where: { active: true },
    orderBy: { externalId: "asc" },
    select: {
      externalId: true,
      externalProfileId: true,
      warmupStatus: true,
      warmupSiteClicks: true,
      googleSessions: true,
      blockedSessions: true,
    },
  });
  console.log(`ACTIVE count=${active.length}`);
  for (const i of active) {
    console.log(
      `${i.externalId} profile=${i.externalProfileId ? "yes" : "NO"} clicks=${i.warmupSiteClicks} google=${i.googleSessions} blocked=${i.blockedSessions}`,
    );
  }

  const since = new Date(Date.now() - 36 * 3600_000);
  const recent = await prisma.session.findMany({
    where: { createdAt: { gte: since }, experiment: { slug: "__warmup__" } },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      status: true,
      errorCode: true,
      createdAt: true,
      identity: { select: { externalId: true, active: true } },
    },
  });
  console.log("\n=== LAST 36h WARMUP SESSIONS ===");
  const counts = new Map();
  for (const s of recent) {
    counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
    console.log(
      `${s.createdAt.toISOString()} ${s.identity.externalId} active=${s.identity.active} ${s.status} err=${s.errorCode ?? "-"}`,
    );
  }
  console.log("counts", Object.fromEntries(counts));

  const dueActive = await prisma.warmupSession.count({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      identity: { active: true },
    },
  });
  const dueInactive = await prisma.warmupSession.count({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
      identity: { active: false },
    },
  });
  console.log(`\ndue scheduled: active=${dueActive} inactive=${dueInactive}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
