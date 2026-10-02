import type { CityConfig } from "../geo/types.js";
import {
  DEFAULT_COUNTRY,
  findCity,
  findCityByRegion,
  getCountry,
  isValidTimezone,
  pickWeightedCity,
} from "../geo/locations.js";

export type RegionConfig = CityConfig;

export const AU_REGIONS: readonly RegionConfig[] = getCountry("AU")?.cities ?? [];

export function pickWeightedRegion(index: number, total: number, country = DEFAULT_COUNTRY): RegionConfig {
  return pickWeightedCity(country, index, total);
}

/**
 * Catalog cities must match their catalog timezone; custom locations only need a real
 * timezone and a locale tagged with the identity's country.
 */
export function isRegionCoherent(
  region: string,
  timezone: string,
  locale: string,
  country = DEFAULT_COUNTRY,
): boolean {
  const config = getCountry(country);
  if (config) {
    const match = findCityByRegion(country, region);
    if (match) return locale === config.locale && match.timezone === timezone;
  }
  return isValidTimezone(timezone) && locale.toUpperCase().endsWith(`-${country.toUpperCase()}`);
}

export function findRegionConfigByCity(city: string, country = DEFAULT_COUNTRY): RegionConfig | undefined {
  return findCity(country, city);
}

export function findRegionConfigByCode(region: string, country = DEFAULT_COUNTRY): RegionConfig | undefined {
  return findCityByRegion(country, region);
}
