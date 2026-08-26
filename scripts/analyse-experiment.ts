#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { prisma } from "../src/db/client.js";
import { getExperimentBySlug } from "../src/experiments/experiment-service.js";
import { generateExperimentReport } from "../src/analytics/report.js";

const program = new Command();

program
  .requiredOption("--experiment <slug>", "experiment slug")
  .option("--output <path>", "output markdown path")
  .action(async (options: { experiment: string; output?: string }) => {
    const experiment = await getExperimentBySlug(options.experiment);
    if (!experiment) {
      throw new Error(`Experiment not found: ${options.experiment}`);
    }
    const report = await generateExperimentReport(experiment.id);
    if (options.output) {
      writeFileSync(options.output, report);
      console.log(`Report written to ${options.output}`);
    } else {
      console.log(report);
    }
  });

program.parse();
