import { findRegionConfigByCity, type RegionConfig } from "../identities/regions.js";
import { prisma } from "../db/client.js";
import { identityAllowedForCampaign } from "../warmup/warmup-service.js";
import { DEFAULT_COUNTRY, getCountry } from "../geo/locations.js";
import { normalizeCampaignCountry, resolveRegionTimezone } from "../experiments/query-generator.js";
import type { IdentityLocationOptions } from "../identities/identity-service.js";

export function findRegionByCity(city: string, country: string = DEFAULT_COUNTRY): RegionConfig | null {
  return findRegionConfigByCity(city, normalizeCampaignCountry(country)) ?? null;
}

export interface CampaignCity {
  city: string;
  region: string;
  timezone: string;
}

/** Catalog city, else a custom city that already has identities in this country. */
export async function resolveCampaignCity(city: string, country: string = DEFAULT_COUNTRY): Promise<CampaignCity | null> {
  const code = normalizeCampaignCountry(country);
  const catalog = findRegionByCity(city, code);
  if (catalog) return { city: catalog.city, region: catalog.region, timezone: catalog.timezone };
  const name = city.trim();
  if (!name) return null;
  const identity = await prisma.identity.findFirst({
    where: { country: code, city: { equals: name, mode: "insensitive" } },
    select: { city: true, region: true, timezone: true },
  });
  return identity ?? null;
}

/** Where new identities for a campaign go: catalog city, custom city cloned from its identities, or country-wide. */
export async function campaignIdentityLocation(
  country: string,
  focusCity?: string | null,
): Promise<IdentityLocationOptions> {
  const code = normalizeCampaignCountry(country);
  if (!focusCity?.trim()) return { country: code };
  if (findRegionByCity(focusCity, code)) return { country: code, city: focusCity };
  const custom = await resolveCampaignCity(focusCity, code);
  if (!custom) throw new Error(`Unknown city for ${code}: ${focusCity}`);
  return { custom: { country: code, city: custom.city, region: custom.region, timezone: custom.timezone } };
}

/** Campaign schedule timezone, including custom cities known only from their identities. */
export async function resolveCampaignTimezone(
  region: string,
  country: string = DEFAULT_COUNTRY,
  focusCity?: string | null,
): Promise<string> {
  const city = focusCity?.trim() ? await resolveCampaignCity(focusCity, country) : null;
  return city?.timezone ?? resolveRegionTimezone(region, country, focusCity);
}

export function listCityOptions(
  country: string = DEFAULT_COUNTRY,
): Array<{ city: string; region: string; timezone: string; country: string }> {
  const code = normalizeCampaignCountry(country);
  return (getCountry(code)?.cities ?? []).map((row) => ({
    city: row.city,
    region: row.region,
    timezone: row.timezone,
    country: code,
  }));
}

export interface GeoCapacity {
  city: string;
  region: string;
  country: string;
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
  country: string = DEFAULT_COUNTRY,
): Promise<GeoCapacity> {
  const code = normalizeCampaignCountry(country);
  const config = await resolveCampaignCity(city, code);
  if (!config) {
    throw new Error(`Unknown city for ${code}: ${city}`);
  }

  const identities = await prisma.identity.findMany({
    where: { active: true, country: code, city: config.city },
  });

  const eligible = identities.filter((identity) =>
    identityAllowedForCampaign(identity, requireWarmup),
  ).length;
  const warming = identities.length - eligible;
  const deficit = Math.max(0, suggested - eligible);

  return {
    city: config.city,
    region: config.region,
    country: code,
    active: identities.length,
    eligible,
    warming,
    suggested,
    deficit,
    proxyCity: config.city.toLowerCase().replace(/\s+/g, "_"),
  };
}
