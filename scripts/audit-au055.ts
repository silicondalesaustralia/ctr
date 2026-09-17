#!/usr/bin/env node
import { prisma } from "../src/db/client.js";

async function main() {
  const idFlag = process.argv.find((a) => a.startsWith("--id="));
  const externalId = idFlag?.slice("--id=".length) ?? "au_055";

  const identity = await prisma.identity.findUnique({
    where: { externalId },
    select: {
      externalId: true,
      active: true,
      blockedSessions: true,
      warmupSiteClicks: true,
      googleSessions: true,
      warmupStatus: true,
      externalProfileId: true,
    },
  });
  console.log("identity", identity);

  const warmups = await prisma.warmupSession.findMany({
    where: { identity: { externalId } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      status: true,
      kind: true,
      queryText: true,
      scheduledAt: true,
      createdAt: true,
      sessionId: true,
      attemptCount: true,
    },
  });
  console.log("\n=== WARMUP ROWS ===");
  for (const w of warmups) {
    console.log(
      `${w.createdAt.toISOString()} ${w.status} ${w.kind} sched=${w.scheduledAt.toISOString()} attempts=${w.attemptCount} session=${w.sessionId ?? "-"} q="${w.queryText}"`,
    );
  }

  const sessions = await prisma.session.findMany({
    where: { identity: { externalId } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      createdAt: true,
      status: true,
      blockReason: true,
      errorCode: true,
      errorMessage: true,
      proxyProvider: true,
      proxyCountry: true,
      proxyCity: true,
      googleLoaded: true,
    },
  });
  console.log("\n=== SESSIONS ===");
  for (const s of sessions) {
    console.log(
      `${s.createdAt.toISOString()} ${s.status} provider=${s.proxyProvider ?? "?"}` +
        ` geo=${s.proxyCountry ?? "?"}/${s.proxyCity ?? "?"} google=${s.googleLoaded}` +
        ` block=${s.blockReason ?? "-"} err=${(s.errorMessage ?? s.errorCode ?? "-").slice(0, 160)}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
