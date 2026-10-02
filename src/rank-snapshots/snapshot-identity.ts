import type { Experiment, Identity } from "@prisma/client";
import { prisma } from "../db/client.js";
import { isIdentityRunnable } from "../identities/provider-compat.js";

/**
 * Least-recently-used warmed local identity that this campaign isn't using, so snapshot
 * searches never land in a campaign identity's history. Falls back to any local identity.
 */
export async function pickSnapshotIdentity(experiment: Experiment): Promise<Identity | null> {
  const [selected, scheduled] = await Promise.all([
    prisma.experimentIdentity.findMany({
      where: { experimentId: experiment.id, selected: true },
      select: { identityId: true },
    }),
    prisma.scheduledSession.findMany({
      where: { experimentId: experiment.id },
      distinct: ["identityId"],
      select: { identityId: true },
    }),
  ]);
  const inCampaign = new Set([...selected, ...scheduled].map((row) => row.identityId));

  const candidates = (
    await prisma.identity.findMany({
      where: {
        active: true,
        country: experiment.country,
        deviceClass: "desktop",
        externalProfileId: { not: null },
      },
      orderBy: { lastUsedAt: { sort: "asc", nulls: "first" } },
    })
  ).filter((identity) => isIdentityRunnable(identity));

  const city = experiment.focusCity?.trim();
  const region = experiment.focusRegion && experiment.focusRegion !== "ALL" ? experiment.focusRegion : null;
  const local = candidates.filter((identity) =>
    city ? identity.city === city : region ? identity.region === region : true,
  );
  // Cold profiles get a truncated SERP from Google, so a warmed one is preferred over LRU order.
  const warmed = local.filter((identity) => identity.warmupStatus === "eligible");
  const pool = warmed.length > 0 ? warmed : local;
  const outsideCampaign = pool.filter((identity) => !inCampaign.has(identity.id));

  return outsideCampaign[0] ?? pool[0] ?? null;
}
