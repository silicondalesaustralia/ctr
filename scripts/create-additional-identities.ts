#!/usr/bin/env node
import { Command } from "commander";
import { createAdditionalIdentities } from "../src/identities/identity-service.js";
import { prisma } from "../src/db/client.js";

const program = new Command();

program
  .option("--count <number>", "number of new identities to append", "20")
  .option("--desktop-percent <number>", "desktop share percent", "65")
  .option("--country <code>", "ISO country code from the built-in list", "AU")
  .option("--city <city>", "force all identities into one city")
  .option("--custom-city <city>", "custom location city (requires --timezone)")
  .option("--timezone <iana>", "custom location timezone, e.g. America/Chicago")
  .option("--locale <tag>", "custom location locale, e.g. en-US")
  .option("--region <code>", "custom location region code")
  .action(
    async (options: {
      count: string;
      desktopPercent: string;
      country: string;
      city?: string;
      customCity?: string;
      timezone?: string;
      locale?: string;
      region?: string;
    }) => {
      const count = Number(options.count);
      const desktopPercent = Number(options.desktopPercent);
      const custom = options.customCity
        ? {
            country: options.country,
            city: options.customCity,
            timezone: options.timezone ?? "",
            locale: options.locale,
            region: options.region,
          }
        : undefined;
      const result = await createAdditionalIdentities({
        count,
        desktopPercent,
        country: options.country,
        city: options.city,
        custom,
      });

      const byCity = new Map<string, number>();
      for (const identity of result.created) {
        const key = `${identity.country}/${identity.region}/${identity.city}`;
        byCity.set(key, (byCity.get(key) ?? 0) + 1);
      }

      console.log(
        `Created ${result.created.length} identities (${result.fromExternalId} → ${result.toExternalId})`,
      );
      for (const [key, n] of [...byCity.entries()].sort()) {
        console.log(`  ${key}: ${n}`);
      }
    },
  );

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
