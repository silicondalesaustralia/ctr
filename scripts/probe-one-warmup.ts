#!/usr/bin/env node
/**
 * Schedule a single benign warmup soon for one clean identity (probe).
 * Usage: npm run warmup:probe-one -- --confirm [--id au_055]
 */
import { prisma } from "../src/db/client.js";
import { pickBenignWarmupQuery } from "../src/warmup/warmup-config.js";

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm");
  }

  const idFlag = process.argv.find((a) => a.startsWith("--id="));
  const preferred = idFlag?.slice("--id=".length);

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

  // Cancel any leftover scheduled rows for this identity only.
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
      ` at=${scheduledAt.toISOString()} query="${queryText}" id=${row.id}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
