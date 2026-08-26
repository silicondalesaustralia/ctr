#!/usr/bin/env node
import { Command } from "commander";
import { validateIdentities } from "../src/identities/identity-service.js";

const program = new Command();

program.action(async () => {
  const issues = await validateIdentities();
  if (issues.length === 0) {
    console.log("All identities passed validation");
    return;
  }
  for (const issue of issues) {
    console.error(`${issue.externalId}: ${issue.issue}`);
  }
  process.exitCode = 1;
});

program.parse();
