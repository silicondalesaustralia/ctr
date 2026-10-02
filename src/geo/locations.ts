import { ENGLISH_COUNTRIES } from "./catalog-english.js";
import { WORLD_COUNTRIES } from "./catalog-world.js";
import type { CityConfig, CountryConfig, CustomLocationInput, IdentityLocation } from "./types.js";

export const DEFAULT_COUNTRY = "AU";

const COUNTRIES: readonly CountryConfig[] = [...ENGLISH_COUNTRIES, ...WORLD_COUNTRIES];

/** International sites for countries outside the catalog. */
const FALLBACK_WARM_SITES = [
  "https://www.bbc.com/news",
  "https://www.wikipedia.org/",
  "https://www.reuters.com/",
  "https://www.accuweather.com/",
];

function normalizeCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

export function listCountries(): readonly CountryConfig[] {
  return COUNTRIES;
}

export function getCountry(code: string | null | undefined): CountryConfig | undefined {
  const wanted = normalizeCode(code);
  return COUNTRIES.find((country) => country.code === wanted);
}

export function countryName(code: string): string {
  const upper = normalizeCode(code);
  const known = getCountry(upper)?.name;
  if (known) return known;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(upper) ?? upper;
  } catch {
    return upper;
  }
}

export function findCity(country: string | null | undefined, city: string | null | undefined): CityConfig | undefined {
  if (!city?.trim()) return undefined;
  const wanted = normalizeCity(city);
  return getCountry(country)?.cities.find((row) => normalizeCity(row.city) === wanted);
}

export function findCityByRegion(country: string | null | undefined, region: string): CityConfig | undefined {
  const wanted = normalizeCode(region);
  return getCountry(country)?.cities.find((row) => row.region === wanted);
}

/** Deterministic weighted spread of `total` identities across a country's cities. */
export function pickWeightedCity(country: string, index: number, total: number): CityConfig {
  const config = getCountry(country);
  if (!config || config.cities.length === 0) {
    throw new Error(`No built-in cities for country ${country}; use a custom location`);
  }
  const sum = config.cities.reduce((acc, row) => acc + row.weight, 0);
  const target = ((index + 0.5) / total) * sum;
  let running = 0;
  for (const row of config.cities) {
    running += row.weight;
    if (target <= running) return row;
  }
  return config.cities[config.cities.length - 1]!;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function canonicalLocale(locale: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    return undefined;
  }
}

export function defaultLocaleFor(country: string): string {
  return getCountry(country)?.locale ?? `en-${normalizeCode(country)}`;
}

export function validateCustomLocation(input: CustomLocationInput): IdentityLocation {
  const country = normalizeCode(input.country);
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new Error(`Country must be a 2-letter ISO code (got "${input.country}")`);
  }
  const city = input.city?.trim();
  if (!city) throw new Error("Custom location needs a city");
  const timezone = input.timezone?.trim();
  if (!timezone || !isValidTimezone(timezone)) {
    throw new Error(`Unknown timezone "${input.timezone}" (use an IANA name such as Europe/London)`);
  }
  const locale = canonicalLocale(input.locale?.trim() || defaultLocaleFor(country));
  if (!locale) throw new Error(`Invalid locale "${input.locale}" (use a tag such as en-GB)`);
  const region = input.region?.trim().toUpperCase() || city.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return { country, city, region, timezone, locale };
}

function fromCity(country: CountryConfig, row: CityConfig): IdentityLocation {
  return { country: country.code, locale: country.locale, region: row.region, city: row.city, timezone: row.timezone };
}

/** One identity's location: a custom location, a forced catalog city, or a weighted pick. */
export function resolveIdentityLocation(
  input: { country?: string; city?: string; custom?: CustomLocationInput },
  index: number,
  total: number,
): IdentityLocation {
  if (input.custom) return validateCustomLocation(input.custom);
  const code = normalizeCode(input.country) || DEFAULT_COUNTRY;
  const country = getCountry(code);
  if (!country) throw new Error(`Country ${code} is not in the built-in list; use a custom location`);
  if (input.city?.trim()) {
    const row = findCity(code, input.city);
    if (!row) throw new Error(`Unknown city for ${country.name}: ${input.city} (use a custom location)`);
    return fromCity(country, row);
  }
  return fromCity(country, pickWeightedCity(code, index, total));
}

export function warmSitesFor(country: string | null | undefined): readonly string[] {
  return getCountry(country)?.warmSites ?? FALLBACK_WARM_SITES;
}
