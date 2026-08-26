#!/usr/bin/env node
import { Command } from "commander";
import { prisma } from "../src/db/client.js";
import { getExperimentBySlug } from "../src/experiments/experiment-service.js";
import { generateMonthlySchedule } from "../src/scheduler/schedule-generator.js";

const program = new Command();

program
  .requiredOption("--experiment <slug>", "experiment slug")
  .action(async (options: { experiment: string }) => {
    const experiment = await getExperimentBySlug(options.experiment);
    if (!experiment) {
      throw new Error(`Experiment not found: ${options.experiment}`);
    }

    const [queries, identities] = await Promise.all([
      prisma.experimentQuery.findMany({ where: { experimentId: experiment.id, active: true } }),
      prisma.identity.findMany({ where: { active: true } }),
    ]);

    const count = await generateMonthlySchedule({ experiment, queries, identities });
    console.log(`Generated ${count} scheduled sessions for ${experiment.slug}`);
  });

program.parse();
