#!/usr/bin/env node
import { prisma } from "../src/db/client.js";
import { assignPersona } from "../src/behaviour/personas.js";

async function main(): Promise<void> {
  const identities = await prisma.identity.findMany({
    where: { personaId: null },
  });

  let assigned = 0;
  for (const identity of identities) {
    const persona = assignPersona(identity.deviceClass, identity.externalId);
    await prisma.identity.update({
      where: { id: identity.id },
      data: {
        personaId: persona.id,
        personaAssignedAt: new Date(),
      },
    });
    assigned += 1;
    console.error(`Assigned ${persona.id} to ${identity.externalId}`);
  }

  console.log(JSON.stringify({ assigned, totalWithoutPersona: identities.length }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
