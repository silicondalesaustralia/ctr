#!/usr/bin/env node
/**
 * End-to-end production smoke test without SSH: creates Camoufox identities in a city and
 * queues one benign Google warmup for the first of them, due now. The deployed worker
 * picks it up within a minute.
 *
 * Usage: BROWSER_PROFILE_PROVIDER=camoufox npx tsx scripts/camoufox-smoke.ts --confirm \
 *   [--city=Adelaide] [--count=1]
 */
import { prisma } from "../src/db/client.js";
import { createAdditionalIdentities } from "../src/identities/identity-service.js";
import { pickBenignWarmupQuery } from "../src/warmup/warmup-config.js";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm (creates real identities in the production DB)");
  }
  if (process.env.BROWSER_PROFILE_PROVIDER !== "camoufox") {
    throw new Error("Set BROWSER_PROFILE_PROVIDER=camoufox so identities are Camoufox-backed");
  }
  const city = arg("city") ?? "Adelaide";
  const count = Number(arg("count") ?? "1");

  const result = await createAdditionalIdentities({ count, city, desktopPercent: 100 });
  const first = result.created[0];
  if (!first) throw new Error("No identity created");

  const warmup = await prisma.warmupSession.create({
    data: {
      identityId: first.id,
      kind: "benign",
      queryText: pickBenignWarmupQuery(city, 0),
      scheduledAt: new Date(),
    },
  });
  console.log(
    `Created ${result.fromExternalId}..${result.toExternalId} in ${city}; ` +
      `benign warmup ${warmup.id} for ${first.externalId} due now ("${warmup.queryText}")`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
