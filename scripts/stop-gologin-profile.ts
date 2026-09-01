#!/usr/bin/env node
import { Command } from "commander";
import { getEnv } from "../src/config/env.js";
import { getIdentityByExternalId } from "../src/identities/identity-service.js";
import { createGoLoginProvider } from "../src/providers/browser/GoLoginProvider.js";
import { forceReleaseGoLoginSlot } from "../src/providers/browser/gologin-slot-lock.js";

const program = new Command();

program
  .requiredOption("--identity <externalId>", "identity external id, e.g. au_001")
  .action(async (options: { identity: string }) => {
    if (getEnv().BROWSER_PROFILE_PROVIDER !== "gologin") {
      throw new Error("BROWSER_PROFILE_PROVIDER must be gologin");
    }

    const identity = await getIdentityByExternalId(options.identity);
    if (!identity?.externalProfileId) {
      throw new Error(`Identity not found or missing profile: ${options.identity}`);
    }

    const provider = createGoLoginProvider();
    await provider.stopProfile(identity.externalProfileId);
    await forceReleaseGoLoginSlot();
    console.log(`Stopped GoLogin cloud profile for ${options.identity}`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
