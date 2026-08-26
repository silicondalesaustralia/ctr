#!/usr/bin/env node
import { Command } from "commander";
import { prisma } from "../src/db/client.js";
import { getExperimentBySlug } from "../src/experiments/experiment-service.js";
import { getIdentityByExternalId } from "../src/identities/identity-service.js";
import { runSession } from "../src/sessions/session-runner.js";

const program = new Command();

program
  .requiredOption("--identity <externalId>", "identity external id")
  .requiredOption("--query <text>", "search query")
  .option("--experiment <slug>", "experiment slug", "test-001")
  .action(async (options: { identity: string; query: string; experiment: string }) => {
    const experiment = await getExperimentBySlug(options.experiment);
    if (!experiment) {
      throw new Error(`Experiment not found: ${options.experiment}`);
    }

    const identity = await getIdentityByExternalId(options.identity);
    if (!identity) {
      throw new Error(`Identity not found: ${options.identity}`);
    }

    const result = await runSession({
      experiment,
      identity,
      queryText: options.query,
      group: "search",
    });

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
      include: { events: true },
    });

    console.log(
      JSON.stringify(
        { result, session },
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );
  });

program.parse();
