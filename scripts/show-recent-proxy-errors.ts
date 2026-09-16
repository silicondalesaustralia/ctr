#!/usr/bin/env node
import { prisma } from "../src/db/client.js";

async function main() {
  const sessions = await prisma.session.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
      status: { in: ["proxy_error", "browser_error", "blocked"] },
      experiment: { slug: "__warmup__" },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      status: true,
      errorCode: true,
      errorMessage: true,
      proxyCountry: true,
      proxyCity: true,
      createdAt: true,
      identity: { select: { externalId: true } },
      events: {
        where: { eventType: "error" },
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { metadataJson: true },
      },
    },
  });

  for (const s of sessions) {
    let msg = s.errorMessage ?? "";
    if (!msg && s.events[0]?.metadataJson) {
      try {
        const meta = JSON.parse(s.events[0].metadataJson) as { message?: string };
        msg = meta.message ?? s.events[0].metadataJson;
      } catch {
        msg = s.events[0].metadataJson;
      }
    }
    console.log(
      `${s.createdAt.toISOString()} ${s.identity.externalId} ${s.status} geo=${s.proxyCountry ?? "?"}/${s.proxyCity ?? "?"} | ${(msg || "(no message)").slice(0, 240)}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
