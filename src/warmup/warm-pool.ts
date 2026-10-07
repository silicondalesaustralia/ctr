import { ProfileProvider } from "@prisma/client";
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { createAdditionalIdentities } from "../identities/identity-service.js";
import { activeProfileProvider, mobileIdentitiesAvailable } from "../identities/provider-compat.js";
import { addMinutes, randomBetween } from "../utils/helpers.js";
import { countPoolIdentities, getWarmPoolTargets, parseWarmPoolKey, POOL_DEVICES } from "./warm-pool-settings.js";
import { campaignIdentityLocation } from "../campaign/geo-capacity.js";

/** Cap identity creation per tick so a big target ramps up gradually. */
const MAX_CREATED_PER_TICK = 3;
/** Warm identities idle this long get a browse session to keep cookies fresh. */
const MAINTENANCE_IDLE_DAYS = 7;

/** Creates Camoufox identities (warming) for city/device pools below their target. */
export async function topUpWarmPools(): Promise<number> {
  if (activeProfileProvider() !== ProfileProvider.camoufox) return 0;
  const targets = await getWarmPoolTargets();
  const devices = POOL_DEVICES.filter((device) => device === "desktop" || mobileIdentitiesAvailable());
  let budget = MAX_CREATED_PER_TICK;

  for (const [key, target] of Object.entries(targets)) {
    const { country, city } = parseWarmPoolKey(key);
    for (const device of devices) {
      if (budget <= 0) break;
      const { warming, eligible } = await countPoolIdentities(city, country, device);
      const deficit = target[device] - warming - eligible;
      if (deficit <= 0) continue;

      const count = Math.min(deficit, budget);
      const location = await campaignIdentityLocation(country, city);
      const desktopPercent = device === "desktop" ? 100 : 0;
      const result = await createAdditionalIdentities({ count, desktopPercent, ...location });
      budget -= result.created.length;
      logger.info({
        event: "warm_pool_topped_up",
        country,
        city,
        device,
        created: result.created.length,
        range: `${result.fromExternalId}..${result.toExternalId}`,
      });
    }
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
