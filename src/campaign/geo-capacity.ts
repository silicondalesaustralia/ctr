import { AU_REGIONS, type RegionConfig } from "../identities/regions.js";
import { prisma } from "../db/client.js";
import { identityAllowedForCampaign } from "../warmup/warmup-service.js";

export function findRegionByCity(city: string): RegionConfig | null {
  const normalized = city.trim().toLowerCase();
  return AU_REGIONS.find((row) => row.city.toLowerCase() === normalized) ?? null;
}

export function listCityOptions(): Array<{ city: string; region: string; timezone: string }> {
  return AU_REGIONS.map((row) => ({
    city: row.city,
    region: row.region,
    timezone: row.timezone,
  }));
}

export interface GeoCapacity {
  city: string;
  region: string;
  active: number;
  eligible: number;
  warming: number;
  suggested: number;
  deficit: number;
  proxyCity: string;
}

export async function getGeoCapacity(
  city: string,
  suggested = 0,
  requireWarmup = true,
): Promise<GeoCapacity> {
  const config = findRegionByCity(city);
  if (!config) {
    throw new Error(`Unknown city: ${city}`);
  }

  const identities = await prisma.identity.findMany({
    where: { active: true, city: config.city },
  });

  const eligible = identities.filter((identity) =>
    identityAllowedForCampaign(identity, requireWarmup),
  ).length;
  const warming = identities.length - eligible;
  const deficit = Math.max(0, suggested - eligible);

  return {
    city: config.city,
    region: config.region,
    active: identities.length,
    eligible,
    warming,
    suggested,
    deficit,
    proxyCity: config.city.toLowerCase().replace(/\s+/g, "_"),
  };
}
