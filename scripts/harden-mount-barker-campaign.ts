#!/usr/bin/env node
/**
 * Harden Plumber Mount Barker (SA): require warmup, select Adelaide mobiles,
 * schedule + accelerate warmups for au_010 / au_014.
 */
import { prisma } from "../src/db/client.js";
import {
  acceleratePendingWarmups,
  rebuildWarmupSchedule,
  refreshWarmupEligibility,
  setCampaignIdentities,
} from "../src/warmup/warmup-service.js";

const EXPERIMENT_ID = "cmtieevlq0036lg0ox0qtplli";
const IDENTITY_EXTERNAL_IDS = ["au_010", "au_014"];

async function main(): Promise<void> {
  const identities = await prisma.identity.findMany({
    where: { externalId: { in: IDENTITY_EXTERNAL_IDS }, active: true },
  });
  if (identities.length === 0) {
    throw new Error(`No active identities found: ${IDENTITY_EXTERNAL_IDS.join(", ")}`);
  }

  await prisma.experiment.update({
    where: { id: EXPERIMENT_ID },
    data: { requireWarmupIdentities: true, status: "paused" },
  });

  await setCampaignIdentities(
    EXPERIMENT_ID,
    identities.map((row) => row.id),
  );

  let scheduled = 0;
  for (const identity of identities) {
    scheduled += await rebuildWarmupSchedule(identity);
    await refreshWarmupEligibility(identity.id);
  }

  const accelerated = await acceleratePendingWarmups(identities.map((row) => row.id));

  const summary = await prisma.identity.findMany({
    where: { id: { in: identities.map((row) => row.id) } },
    select: {
      externalId: true,
      warmupStatus: true,
      warmupSessionsCompleted: true,
      warmupSiteClicks: true,
      warmupGraduationPassed: true,
      blockedSessions: true,
    },
  });

  const warmups = await prisma.warmupSession.findMany({
    where: {
      identityId: { in: identities.map((row) => row.id) },
      status: "scheduled",
    },
    orderBy: { scheduledAt: "asc" },
    include: { identity: { select: { externalId: true } } },
  });

  console.log(JSON.stringify({
    experimentId: EXPERIMENT_ID,
    requireWarmupIdentities: true,
    identities: summary,
    warmupSessionsScheduled: scheduled,
    warmupsAccelerated: accelerated,
    nextWarmups: warmups.slice(0, 8).map((row) => ({
      identity: row.identity.externalId,
      kind: row.kind,
      at: row.scheduledAt.toISOString(),
      query: row.queryText,
    })),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
