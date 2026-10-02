import { ProfileProvider } from "@prisma/client";
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { createAdditionalIdentities } from "../identities/identity-service.js";
import { activeProfileProvider } from "../identities/provider-compat.js";
import { addMinutes, randomBetween } from "../utils/helpers.js";
import { countPoolIdentities, getWarmPoolTargets, parseWarmPoolKey } from "./warm-pool-settings.js";
import { campaignIdentityLocation } from "../campaign/geo-capacity.js";

/** Cap identity creation per tick so a big target ramps up gradually. */
const MAX_CREATED_PER_TICK = 3;
/** Warm identities idle this long get a browse session to keep cookies fresh. */
const MAINTENANCE_IDLE_DAYS = 7;

/** Creates Camoufox identities (desktop, warming) for cities below their target. */
export async function topUpWarmPools(): Promise<number> {
  if (activeProfileProvider() !== ProfileProvider.camoufox) return 0;
  const targets = await getWarmPoolTargets();
  let budget = MAX_CREATED_PER_TICK;

  for (const [key, target] of Object.entries(targets)) {
    if (budget <= 0) break;
    const { country, city } = parseWarmPoolKey(key);
    const { warming, eligible } = await countPoolIdentities(city, country);
    const deficit = target - warming - eligible;
    if (deficit <= 0) continue;

    const count = Math.min(deficit, budget);
    const location = await campaignIdentityLocation(country, city);
    const result = await createAdditionalIdentities({ count, desktopPercent: 100, ...location });
    budget -= result.created.length;
    logger.info({
      event: "warm_pool_topped_up",
      country,
      city,
      created: result.created.length,
      range: `${result.fromExternalId}..${result.toExternalId}`,
    });
  }
  return MAX_CREATED_PER_TICK - budget;
}

/** Schedules one browse session for eligible identities idle ≥ MAINTENANCE_IDLE_DAYS. */
export async function scheduleWarmPoolMaintenance(): Promise<number> {
  if (activeProfileProvider() !== ProfileProvider.camoufox) return 0;
  const idleSince = addMinutes(new Date(), -MAINTENANCE_IDLE_DAYS * 24 * 60);
  const idle = await prisma.identity.findMany({
    where: {
      active: true,
      profileProvider: ProfileProvider.camoufox,
      warmupStatus: "eligible",
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: idleSince } }],
      warmupSessions: { none: { status: { in: ["scheduled", "running"] } } },
    },
    select: { id: true },
  });

  for (const identity of idle) {
    await prisma.warmupSession.create({
      data: {
        identityId: identity.id,
        queryText: "maintenance:browse",
        kind: "browse",
        scheduledAt: addMinutes(new Date(), randomBetween(15, 360)),
      },
    });
  }
  if (idle.length > 0) {
    logger.info({ event: "warm_pool_maintenance_scheduled", identities: idle.length });
  }
  return idle.length;
}

export async function runWarmPoolTick(): Promise<void> {
  try {
    await topUpWarmPools();
    await scheduleWarmPoolMaintenance();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ event: "warm_pool_tick_failed", error: message });
  }
}
