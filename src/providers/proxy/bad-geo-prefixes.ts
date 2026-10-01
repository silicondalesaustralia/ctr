import { prisma } from "../../db/client.js";
import { logger } from "../../config/logger.js";
import { ipPrefix } from "./ip-reputation.js";
import { toPremiumPortsCitySlug } from "./premiumports-utils.js";

/** How long a /24 that egressed in the wrong place stays out of rotation. */
export const BAD_GEO_PREFIX_TTL_DAYS = 30;

/** Scope for ranges that left the country: bad for every city. */
export const ANY_CITY = "*";

export class BadGeoPrefixError extends Error {
  readonly prefix: string;

  constructor(prefix: string, ip: string, scope: string) {
    super(`Proxy egress IP prefix flagged for wrong geo: prefix=${prefix} ip=${ip} scope=${scope}`);
    this.name = "BadGeoPrefixError";
    this.prefix = prefix;
  }
}

export function geoScope(city?: string): string {
  return city?.trim() ? toPremiumPortsCitySlug(city) : ANY_CITY;
}

export async function recordBadGeoPrefix(
  ip: string,
  scope: string,
  reason: string,
  lastGeo?: string,
): Promise<void> {
  const prefix = ipPrefix(ip);
  if (!prefix) return;
  try {
    await prisma.badGeoIpPrefix.upsert({
      where: { prefix_scope: { prefix, scope } },
      create: { prefix, scope, reason, lastGeo },
      update: { reason, lastGeo, failCount: { increment: 1 }, lastFailedAt: new Date() },
    });
    logger.warn({ event: "ip_prefix_bad_geo", prefix, scope, reason, lastGeo });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ event: "ip_prefix_bad_geo_record_failed", prefix, error: message });
  }
}

/** Throws BadGeoPrefixError when the IP's /24 recently egressed outside the country or this city. */
export async function assertGeoPrefixClean(ip: string, city?: string): Promise<void> {
  const prefix = ipPrefix(ip);
  if (!prefix) return;
  const since = new Date(Date.now() - BAD_GEO_PREFIX_TTL_DAYS * 24 * 60 * 60 * 1000);
  const scopes = [...new Set([ANY_CITY, geoScope(city)])];
  const flagged = await prisma.badGeoIpPrefix.findFirst({
    where: { prefix, scope: { in: scopes }, lastFailedAt: { gte: since } },
  });
  if (flagged) throw new BadGeoPrefixError(prefix, ip, flagged.scope);
}
