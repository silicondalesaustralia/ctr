#!/usr/bin/env node
/**
 * Run one campaign session locally (Orbita + Decodo) until geo/proxy works.
 * Usage: npx tsx scripts/run-campaign-session.ts --campaign <id>
 */
import { Command } from "commander";
import { prisma } from "../src/db/client.js";
import { getEnv } from "../src/config/env.js";
import { runSession } from "../src/sessions/session-runner.js";
import { cleanupStaleSessions } from "../src/sessions/session-cleanup.js";

const program = new Command();

program
  .requiredOption("--campaign <id>", "experiment/campaign id")
  .option("--identity <externalId>", "force identity external id")
  .option("--query <text>", "force query text")
  .action(
    async (options: {
      campaign: string;
      identity?: string;
      query?: string;
    }) => {
      const env = getEnv();
      console.error(
        `[probe] PROXY=${env.PROXY_PROVIDER} BROWSER=${env.BROWSER_PROFILE_PROVIDER} RUNTIME=${env.GOLOGIN_BROWSER_RUNTIME}`,
      );

      const experiment = await prisma.experiment.findUnique({
        where: { id: options.campaign },
        include: {
          queries: { where: { active: true }, take: 20 },
          selectedIdentities: { include: { identity: true } },
        },
      });
      if (!experiment) {
        throw new Error(`Campaign not found: ${options.campaign}`);
      }

      const identityRow = options.identity
        ? experiment.selectedIdentities.find(
            (row) => row.identity.externalId === options.identity,
          )
        : experiment.selectedIdentities[0];
      if (!identityRow) {
        throw new Error("No identity selected on campaign");
      }

      const queryText = options.query ?? experiment.queries[0]?.query;
      if (!queryText) {
        throw new Error("No query available");
      }

      console.error(
        `[probe] campaign=${experiment.name} identity=${identityRow.identity.externalId} query="${queryText}"`,
      );

      await cleanupStaleSessions();

      const result = await runSession({
        experiment,
        identity: identityRow.identity,
        queryText,
        group: "search",
      });

      const session = await prisma.session.findUnique({
        where: { id: result.sessionId },
        include: { events: { orderBy: { timestamp: "asc" } } },
      });

      console.log(
        JSON.stringify(
          {
            result,
            status: session?.status,
            errorCode: session?.errorCode,
            errorMessage: session?.errorMessage,
            proxyCountry: session?.proxyCountry,
            proxyCity: session?.proxyCity,
            events: session?.events.map((e) => ({
              type: e.eventType,
              at: e.timestamp,
              payload: e.metadataJson,
            })),
          },
          (_key, value) => (typeof value === "bigint" ? value.toString() : value),
          2,
        ),
      );

      if (session?.status !== "completed" && session?.errorCode === "proxy_error") {
        process.exitCode = 2;
      } else if (session?.status !== "completed") {
        process.exitCode = 1;
      }
    },
  );

program.parseAsync(process.argv).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
