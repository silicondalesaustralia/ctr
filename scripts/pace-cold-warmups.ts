#!/usr/bin/env node
/**
 * Option 2+3: only 3 cold identities warm soon; rest delayed & stretched.
 * Usage: npx tsx scripts/pace-cold-warmups.ts
 */
import { prisma } from "../src/db/client.js";
import { addMinutes, randomBetween } from "../src/utils/helpers.js";

const ACTIVE = ["au_015", "au_016", "au_017"];
const GAP_MINUTES = 120;
const ACTIVE_LEAD_MINUTES = 90;
const PARKED_START_HOURS = 48;
const PARKED_IDENTITY_STAGGER_HOURS = 18;
const PARKED_SESSION_GAP_HOURS = 8;

async function main() {
  const identities = await prisma.identity.findMany({
    where: {
      externalId: { gte: "au_015", lte: "au_035" },
      warmupStatus: "warming",
    },
    orderBy: { externalId: "asc" },
    select: { id: true, externalId: true },
  });

  if (identities.length === 0) {
    throw new Error("no warming identities in au_015–au_035");
  }

  const now = new Date();
  let updated = 0;
  const summary: Array<{ externalId: string; cohort: string; slots: string[] }> = [];

  for (const identity of identities) {
    const pending = await prisma.warmupSession.findMany({
      where: { identityId: identity.id, status: "scheduled" },
      orderBy: [{ kind: "asc" }, { scheduledAt: "asc" }],
    });
    // benign before graduation
    pending.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "benign" ? -1 : 1;
      return a.scheduledAt.getTime() - b.scheduledAt.getTime();
    });

    const isActive = ACTIVE.includes(identity.externalId);
    const slots: string[] = [];

    if (isActive) {
      for (let i = 0; i < pending.length; i += 1) {
        const scheduledAt = addMinutes(
          now,
          ACTIVE_LEAD_MINUTES + i * GAP_MINUTES + randomBetween(0, 20),
        );
        await prisma.warmupSession.update({
          where: { id: pending[i]!.id },
          data: { scheduledAt },
        });
        slots.push(scheduledAt.toISOString());
        updated += 1;
      }
      summary.push({ externalId: identity.externalId, cohort: "active", slots });
      continue;
    }

    const parkedIndex = identities
      .filter((row) => !ACTIVE.includes(row.externalId))
      .findIndex((row) => row.id === identity.id);
    const identityLeadHours =
      PARKED_START_HOURS + parkedIndex * PARKED_IDENTITY_STAGGER_HOURS;

    for (let i = 0; i < pending.length; i += 1) {
      const scheduledAt = addMinutes(
        now,
        identityLeadHours * 60 +
          i * PARKED_SESSION_GAP_HOURS * 60 +
          randomBetween(0, 40),
      );
      await prisma.warmupSession.update({
        where: { id: pending[i]!.id },
        data: { scheduledAt },
      });
      slots.push(scheduledAt.toISOString());
      updated += 1;
    }
    summary.push({ externalId: identity.externalId, cohort: "parked", slots });
  }

  const dueSoon = await prisma.warmupSession.count({
    where: {
      status: "scheduled",
      scheduledAt: { lte: addMinutes(now, 6 * 60) },
      identity: { externalId: { gte: "au_015", lte: "au_035" } },
    },
  });

  console.log(
    JSON.stringify(
      {
        updated,
        activeCohort: ACTIVE,
        dueInNext6h: dueSoon,
        sample: summary.slice(0, 6),
        lastParked: summary.filter((row) => row.cohort === "parked").slice(-2),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
