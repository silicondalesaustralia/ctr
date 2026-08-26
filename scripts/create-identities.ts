#!/usr/bin/env node
import { Command } from "commander";
import { createIdentities } from "../src/identities/identity-service.js";

const program = new Command();

program
  .option("--count <number>", "number of identities", "10")
  .action(async (options: { count: string }) => {
    const count = Number(options.count);
    const identities = await createIdentities({ count });
    console.log(`Created/updated ${identities.length} identities`);
  });

program.parse();
