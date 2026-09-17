#!/usr/bin/env node
/**
 * Schedule a single benign warmup soon for one clean identity (probe).
 * Refuses if cookie-age browses are incomplete unless --force.
 * Usage: npm run warmup:probe-one -- --confirm [--id=au_055] [--force]
 */
import { prisma } from "../src/db/client.js";
import {
  pickBenignWarmupQuery,
  WARMUP_BROWSE_SESSIONS,
} from "../src/warmup/warmup-config.js";

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm");
  }

  const idFlag = process.argv.find((a) => a.startsWith("--id="));
  const preferred = idFlag?.slice("--id=".length);
  const force = process.argv.includes("--force");

  const candidates = await prisma.identity.findMany({
    where: {
      active: true,
      blockedSessions: 0,
      warmupStatus: "warming",
      ...(preferred ? { externalId: preferred } : {}),
    },
    orderBy: { externalId: "asc" },
  });

  const identity = candidates[0];
  if (!identity) {
    throw new Error(
      preferred
        ? `No clean active identity ${preferred}`
        : "No clean active identities (active, 0 blocks, warming)",
    );
  }

  const completedBrowses = await prisma.warmupSession.count({
    where: {
      identityId: identity.id,
      kind: "browse",
      status: "completed",
    },
  });
  if (!force && WARMUP_BROWSE_SESSIONS > 0 && completedBrowses < WARMUP_BROWSE_SESSIONS) {
    throw new Error(
      `Cookie-age incomplete for ${identity.externalId}: ` +
        `${completedBrowses}/${WARMUP_BROWSE_SESSIONS} browse sessions completed. ` +
        `Wait for browses, or pass --force to Google-probe anyway.`,
    );
  }

  await prisma.warmupSession.updateMany({
    where: { identityId: identity.id, status: { in: ["scheduled", "running"] } },
    data: { status: "cancelled" },
  });

  const delayMinutes = 20;
  const scheduledAt = new Date(Date.now() + delayMinutes * 60_000);
  const queryText = pickBenignWarmupQuery(identity.city, identity.warmupSiteClicks);

  const row = await prisma.warmupSession.create({
    data: {
      identityId: identity.id,
      queryText,
      kind: "benign",
      scheduledAt,
    },
  });

  console.log(
    `Probe scheduled: ${identity.externalId} benign in ~${delayMinutes}m` +
      ` at=${scheduledAt.toISOString()} query="${queryText}" id=${row.id}` +
      ` (browses=${completedBrowses}/${WARMUP_BROWSE_SESSIONS}${force ? ", forced" : ""})`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
