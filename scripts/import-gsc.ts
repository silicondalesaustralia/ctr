#!/usr/bin/env node
import { Command } from "commander";
import { prisma } from "../src/db/client.js";
import { getExperimentBySlug } from "../src/experiments/experiment-service.js";
import { importGscFile } from "../src/analytics/gsc.js";

const program = new Command();

program
  .requiredOption("--experiment <slug>", "experiment slug")
  .requiredOption("--file <path>", "GSC CSV/YAML file path")
  .action(async (options: { experiment: string; file: string }) => {
    const experiment = await getExperimentBySlug(options.experiment);
    if (!experiment) {
      throw new Error(`Experiment not found: ${options.experiment}`);
    }
    const imported = await importGscFile(experiment.id, options.file);
    console.log(`Imported ${imported} ranking snapshots`);
  });

program.parse();
