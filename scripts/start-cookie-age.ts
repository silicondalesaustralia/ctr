#!/usr/bin/env node
/**
 * Start cookie-age for fresh identities: create (optional) + schedule browse-first warmups.
 * Does NOT schedule an immediate Google probe.
 *
 * Usage:
 *   npm run warmup:cookie-age -- --confirm --count 1
 *   npm run warmup:cookie-age -- --confirm --id=au_081
 */
import { prisma } from "../src/db/client.js";
import { rebuildWarmupSchedule } from "../src/warmup/warmup-service.js";
import {
  WARMUP_BROWSE_FIRST_DELAY_HOURS,
  WARMUP_BROWSE_SESSIONS,
  WARMUP_BROWSE_SPREAD_DAYS,
} from "../src/warmup/warmup-config.js";

async function createOneIdentity(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync(
    "npm",
    ["run", "identities:create-additional", "--", "--count", "1"],
    { encoding: "utf8", cwd: process.cwd() },
  );
  process.stdout.write(out);
  const match = out.match(/Created 1 identities \((au_\d+)/);
  if (!match?.[1]) {
    throw new Error("Failed to parse new identity id from create output");
  }
  return match[1];
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm");
  }

  const idFlag = process.argv.find((a) => a.startsWith("--id="));
  const countFlag = process.argv.find((a) => a.startsWith("--count="));
  const count = countFlag ? Number(countFlag.slice("--count=".length)) : 1;
  if (!Number.isFinite(count) || count < 1 || count > 5) {
    throw new Error("--count must be 1–5");
  }

  const externalIds: string[] = [];
  if (idFlag) {
    externalIds.push(idFlag.slice("--id=".length));
  } else {
    for (let i = 0; i < count; i += 1) {
      externalIds.push(await createOneIdentity());
    }
  }

  for (const externalId of externalIds) {
    const identity = await prisma.identity.findUnique({ where: { externalId } });
    if (!identity) {
      throw new Error(`Identity not found: ${externalId}`);
    }
    if (!identity.active) {
      throw new Error(`Identity ${externalId} is inactive — pick a clean one`);
    }

    const scheduled = await rebuildWarmupSchedule(identity);
    const rows = await prisma.warmupSession.findMany({
      where: { identityId: identity.id, status: "scheduled" },
      orderBy: { scheduledAt: "asc" },
      select: { kind: true, scheduledAt: true, queryText: true },
    });

    console.log(
      `\nCookie-age scheduled for ${externalId}: ${scheduled} rows` +
        ` (browse=${WARMUP_BROWSE_SESSIONS} over ~${WARMUP_BROWSE_SPREAD_DAYS}d,` +
        ` first browse delay ~${WARMUP_BROWSE_FIRST_DELAY_HOURS}h)`,
    );
    for (const row of rows) {
      console.log(
        `  ${row.scheduledAt.toISOString()}  ${row.kind.padEnd(11)}  ${row.queryText}`,
      );
    }
  }

  console.log(
    "\nDo not run warmup:probe-one until browse rows complete." +
      " Then: npm run warmup:probe-one -- --confirm --id=au_XXX",
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
