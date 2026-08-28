#!/usr/bin/env node
/**
 * Harden Breeches campaign against Google blocks:
 * - require warmed identities
 * - balanced desktop/mobile mix (default 65/35)
 * - hand-picked pool across both device classes (no prior blocks)
 * - compress warmup timeline for selected identities
 * - reschedule campaign sessions to eligible identities only
 */
import { prisma } from "../src/db/client.js";
import { setCampaignIdentities } from "../src/warmup/warmup-service.js";
import { generateCampaignSchedule } from "../src/scheduler/schedule-generator.js";
import { getCampaignIdentityPool } from "../src/warmup/warmup-service.js";
import { addMinutes, randomBetween } from "../src/utils/helpers.js";

const EXPERIMENT_ID = "cmtb071ir0000mr0ogp4a1cs0";
const DESKTOP_PERCENT = 65;
const POOL_SIZE_PER_DEVICE = 4;

function scoreIdentity(identity: {
  warmupSessionsCompleted: number;
  warmupSiteClicks: number;
  blockedSessions: number;
}): number {
  return (
    identity.warmupSessionsCompleted * 10 +
    identity.warmupSiteClicks * 5 -
    identity.blockedSessions * 100
  );
}

async function pickBalancedPool(): Promise<string[]> {
  const identities = await prisma.identity.findMany({
    where: { active: true, blockedSessions: 0 },
    orderBy: { externalId: "asc" },
  });

  const pick = (deviceClass: "desktop" | "mobile") =>
    identities
      .filter((identity) => identity.deviceClass === deviceClass)
      .sort((a, b) => scoreIdentity(b) - scoreIdentity(a))
      .slice(0, POOL_SIZE_PER_DEVICE)
      .map((identity) => identity.id);

  return [...pick("desktop"), ...pick("mobile")];
}

async function accelerateWarmups(identityIds: string[]): Promise<number> {
  const now = new Date();
  let updated = 0;

  for (const identityId of identityIds) {
    const identity = await prisma.identity.findUniqueOrThrow({ where: { id: identityId } });
    if (identity.warmupStatus === "eligible") continue;

    const pending = await prisma.warmupSession.findMany({
      where: { identityId, status: "scheduled" },
      orderBy: { scheduledAt: "asc" },
    });

    let cursor = addMinutes(now, randomBetween(45, 120));
    for (const session of pending) {
      await prisma.warmupSession.update({
        where: { id: session.id },
        data: { scheduledAt: cursor },
      });
      cursor = addMinutes(cursor, randomBetween(180, 360));
      updated += 1;
    }
  }

  return updated;
}

async function main() {
  const experiment = await prisma.experiment.findUniqueOrThrow({
    where: { id: EXPERIMENT_ID },
    include: { queries: { where: { active: true } } },
  });

  const identityPool = await pickBalancedPool();
  if (identityPool.length === 0) {
    throw new Error("No identities without blocks found");
  }

  await prisma.experiment.update({
    where: { id: EXPERIMENT_ID },
    data: {
      requireWarmupIdentities: true,
      desktopPercent: DESKTOP_PERCENT,
    },
  });

  await setCampaignIdentities(EXPERIMENT_ID, identityPool);

  const accelerated = await accelerateWarmups(identityPool);

  await prisma.scheduledSession.updateMany({
    where: { experimentId: EXPERIMENT_ID, status: "scheduled" },
    data: { status: "cancelled" },
  });

  const refreshed = await prisma.experiment.findUniqueOrThrow({
    where: { id: EXPERIMENT_ID },
    include: { queries: { where: { active: true } } },
  });
  const identities = await getCampaignIdentityPool(EXPERIMENT_ID, refreshed.focusRegion);

  const count = await generateCampaignSchedule({
    experiment: refreshed,
    queries: refreshed.queries,
    identities,
    totalSessions: refreshed.monthlySessionTarget,
    startDate: new Date(),
    durationDays: refreshed.campaignDurationDays,
  });

  const selected = await prisma.identity.findMany({
    where: { id: { in: identityPool } },
    select: { externalId: true, warmupStatus: true, warmupSessionsCompleted: true, warmupSiteClicks: true, blockedSessions: true },
  });

  const nextCampaign = await prisma.scheduledSession.findMany({
    where: { experimentId: EXPERIMENT_ID, status: "scheduled" },
    orderBy: { scheduledAt: "asc" },
    take: 5,
    include: { identity: { select: { externalId: true } } },
  });

  const nextWarmups = await prisma.warmupSession.findMany({
    where: { identityId: { in: identityPool }, status: "scheduled" },
    orderBy: { scheduledAt: "asc" },
    take: 8,
    include: { identity: { select: { externalId: true } } },
  });

  console.log("Updated Breeches:");
  console.log("  requireWarmupIdentities: true");
  console.log("  desktopPercent:", DESKTOP_PERCENT);
  console.log("  selected identities:", selected);
  console.log("  warmups accelerated:", accelerated);
  console.log("  campaign sessions scheduled:", count);
  console.log(
    "  next campaign slots:",
    nextCampaign.map((row) => `${row.identity.externalId} @ ${row.scheduledAt.toISOString()}`),
  );
  console.log(
    "  next warmups:",
    nextWarmups.map((row) => `${row.identity.externalId} @ ${row.scheduledAt.toISOString()}`),
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
