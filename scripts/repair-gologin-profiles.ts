#!/usr/bin/env node
import { Command } from "commander";
import { DeviceClass, ProfileProvider } from "@prisma/client";
import { prisma } from "../src/db/client.js";
import { createGoLoginProvider } from "../src/providers/browser/GoLoginProvider.js";
import { isValidGoLoginProfileId } from "../src/providers/browser/gologin-utils.js";
import { getEnv } from "../src/config/env.js";

const program = new Command();

program
  .option("--identity <externalId>", "repair one identity, e.g. au_008")
  .option("--mobile-only", "repair mobile identities with invalid GoLogin profile IDs")
  .action(async (options: { identity?: string; mobileOnly?: boolean }) => {
    if (getEnv().BROWSER_PROFILE_PROVIDER !== "gologin") {
      throw new Error("BROWSER_PROFILE_PROVIDER must be gologin");
    }

    const identities = await prisma.identity.findMany({
      where: options.identity ? { externalId: options.identity } : undefined,
      orderBy: { externalId: "asc" },
    });

    if (identities.length === 0) {
      throw new Error(options.identity ? `Identity not found: ${options.identity}` : "No identities found");
    }

    const toRepair = identities.filter((identity) => {
      if (options.mobileOnly && identity.deviceClass !== DeviceClass.mobile) {
        return false;
      }
      return !isValidGoLoginProfileId(identity.externalProfileId);
    });

    if (toRepair.length === 0) {
      console.log("No identities need GoLogin profile repair");
      return;
    }

    const provider = createGoLoginProvider();
    for (const identity of toRepair) {
      console.error(`Creating GoLogin profile for ${identity.externalId} (${identity.deviceClass})...`);
      const profile = await provider.createProfile({
        name: identity.externalId,
        deviceClass: identity.deviceClass,
        osFamily: identity.osFamily,
        locale: identity.locale,
        timezone: identity.timezone,
        region: identity.region,
        city: identity.city,
      });

      await prisma.identity.update({
        where: { id: identity.id },
        data: {
          externalProfileId: profile.profileId,
          profileProvider: ProfileProvider.gologin,
        },
      });

      console.log(`${identity.externalId}: ${profile.profileId}`);
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
