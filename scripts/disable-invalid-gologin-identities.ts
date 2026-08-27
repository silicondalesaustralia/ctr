#!/usr/bin/env node
import { prisma } from "../src/db/client.js";
import { getEnv } from "../src/config/env.js";
import { isValidGoLoginProfileId } from "../src/providers/browser/gologin-utils.js";

async function main(): Promise<void> {
  if (getEnv().BROWSER_PROFILE_PROVIDER !== "gologin") {
    throw new Error("BROWSER_PROFILE_PROVIDER must be gologin");
  }

  const identities = await prisma.identity.findMany({
    where: { active: true },
    orderBy: { externalId: "asc" },
  });

  const invalid = identities.filter(
    (identity) => !isValidGoLoginProfileId(identity.externalProfileId),
  );

  if (invalid.length === 0) {
    console.log("All active identities have valid GoLogin profile IDs");
    return;
  }

  for (const identity of invalid) {
    await prisma.identity.update({
      where: { id: identity.id },
      data: { active: false },
    });
    console.log(`Disabled ${identity.externalId} (invalid GoLogin profile ID)`);
  }

  const remaining = identities.length - invalid.length;
  console.log(`${remaining} active identity/identities remain with valid GoLogin profiles`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
