#!/usr/bin/env node
/**
 * Delete GoLogin profiles for inactive identities to free plan seats.
 * Clears externalProfileId after a successful delete (404 = already gone).
 *
 * Usage: npm run gologin:delete-retired -- --confirm
 */
import { prisma } from "../src/db/client.js";
import { getEnv } from "../src/config/env.js";
import { createGoLoginProvider } from "../src/providers/browser/GoLoginProvider.js";
import { isValidGoLoginProfileId } from "../src/providers/browser/gologin-utils.js";
import { sleep } from "../src/utils/helpers.js";

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing to run without --confirm (deletes GoLogin profiles)");
  }
  if (getEnv().BROWSER_PROFILE_PROVIDER !== "gologin") {
    throw new Error("BROWSER_PROFILE_PROVIDER must be gologin");
  }

  const provider = createGoLoginProvider();
  const retired = await prisma.identity.findMany({
    where: { active: false },
    orderBy: { externalId: "asc" },
  });

  let deleted = 0;
  let missing = 0;
  let skipped = 0;
  let failed = 0;

  for (const identity of retired) {
    const profileId = identity.externalProfileId;
    if (!isValidGoLoginProfileId(profileId)) {
      skipped += 1;
      continue;
    }

    try {
      await provider.deleteProfile(profileId!);
      await prisma.identity.update({
        where: { id: identity.id },
        data: { externalProfileId: null },
      });
      deleted += 1;
      console.log(`Deleted ${identity.externalId} profile ${profileId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("404")) {
        await prisma.identity.update({
          where: { id: identity.id },
          data: { externalProfileId: null },
        });
        missing += 1;
        console.log(`Already gone ${identity.externalId} (${profileId})`);
      } else {
        failed += 1;
        console.error(`Failed ${identity.externalId}: ${message}`);
      }
    }

    await sleep(250);
  }

  console.log(
    `Done: deleted=${deleted} alreadyGone=${missing} skipped=${skipped} failed=${failed}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
