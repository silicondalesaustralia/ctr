#!/usr/bin/env node
import { assignMissingPersonas } from "../src/identities/identity-service.js";

async function main(): Promise<void> {
  const assigned = await assignMissingPersonas();
  console.log(JSON.stringify({ assigned }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
