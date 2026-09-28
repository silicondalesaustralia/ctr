#!/usr/bin/env node
/**
 * Delete one inactive identity's GoLogin profile to free a plan seat.
 *
 * Usage: npx tsx scripts/delete-one-gologin-profile.ts --confirm --id=au_083
 */
import { prisma } from "../src/db/client.js";
import { createGoLoginProvider } from "../src/providers/browser/GoLoginProvider.js";

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Refusing without --confirm (permanently deletes a GoLogin profile)");
  }
  const externalId = process.argv.find((a) => a.startsWith("--id="))?.slice(5);
  if (!externalId) throw new Error("--id=<externalId> is required");

  const identity = await prisma.identity.findUnique({ where: { externalId } });
  if (!identity) throw new Error(`Identity not found: ${externalId}`);
  if (identity.active) throw new Error(`${externalId} is active — refusing`);
  const profileId = identity.externalProfileId;
  if (!profileId) throw new Error(`${externalId} has no GoLogin profile`);

  try {
    await createGoLoginProvider().deleteProfile(profileId);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("404"))) throw error;
  }
  await prisma.identity.update({ where: { id: identity.id }, data: { externalProfileId: null } });
  console.log(`Deleted ${externalId} profile ${profileId}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
