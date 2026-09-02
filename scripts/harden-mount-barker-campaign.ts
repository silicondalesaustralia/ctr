#!/usr/bin/env node
/**
 * Harden Plumber Mount Barker (SA): require warmup, select Adelaide mobiles,
 * schedule + accelerate warmups for au_010 / au_014.
 */
import { prisma } from "../src/db/client.js";
import {
  rebuildWarmupSchedule,
  setCampaignIdentities,
} from "../src/warmup/warmup-service.js";
import { addMinutes, randomBetween } from "../src/utils/helpers.js";

const EXPERIMENT_ID = "cmtieevlq0036lg0ox0qtplli";
const IDENTITY_EXTERNAL_IDS = ["au_010", "au_014"];

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

    let cursor = addMinutes(now, randomBetween(30, 90));
    for (const session of pending) {
      await prisma.warmupSession.update({
        where: { id: session.id },
        data: { scheduledAt: cursor },
      });
      cursor = addMinutes(cursor, randomBetween(120, 240));
      updated += 1;
    }
  }

  return updated;
}

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
  }

  const accelerated = await accelerateWarmups(identities.map((row) => row.id));

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
