#!/usr/bin/env node
import { Command } from "commander";
import { createExperimentFromConfig } from "../src/experiments/experiment-service.js";

const program = new Command();

program.argument("<config>", "path to experiment yaml").action(async (config: string) => {
  const result = await createExperimentFromConfig(config);
  console.log(`Experiment ${result.experiment.slug} created with ${result.queries.length} queries`);
});

program.parse();
