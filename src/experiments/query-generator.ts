import type { QueryType } from "@prisma/client";
import {
  countryName,
  DEFAULT_COUNTRY,
  findCity,
  findCityByRegion,
  getCountry,
} from "../geo/locations.js";

export interface GeneratedQuery {
  text: string;
  type: QueryType;
  weight: number;
}

const REGION_LOCAL_PHRASES: Record<string, string> = {
  NSW: "new south wales",
  VIC: "victoria",
  QLD: "queensland",
  WA: "western australia",
  SA: "south australia",
  TAS: "tasmania",
  ACT: "canberra",
  NT: "northern territory",
};

function possessiveVariant(keyword: string): string | null {
  const variant = keyword
    .replace(/\bwomens\b/gi, "women's")
    .replace(/\bmens\b/gi, "men's")
    .replace(/\bkids\b/gi, "kid's")
    .trim();
  return variant.toLowerCase() !== keyword.toLowerCase() ? variant : null;
}

function ridingVariant(keyword: string): string | null {
  const lower = keyword.toLowerCase();
  if (/\bbreeches\b/.test(lower) && !/\briding\b/.test(lower)) {
    return `${keyword} riding`.replace(/\s+/g, " ").trim();
  }
  if (/\bboots\b/.test(lower) && !/\briding\b/.test(lower)) {
    return `riding ${keyword}`.replace(/\s+/g, " ").trim();
  }
  return null;
}

function normalizeWeights(queries: GeneratedQuery[]): GeneratedQuery[] {
  const total = queries.reduce((sum, query) => sum + query.weight, 0);
  if (total <= 0) {
    return queries;
  }

  return queries.map((query) => ({
    ...query,
    weight: Number((query.weight / total).toFixed(4)),
  }));
}

function dedupeQueries(queries: GeneratedQuery[]): GeneratedQuery[] {
  const seen = new Set<string>();
  const deduped: GeneratedQuery[] = [];

  for (const query of queries) {
    const key = query.text.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ ...query, text: query.text.trim() });
  }

  return deduped;
}

export function normalizeCampaignCountry(country?: string | null): string {
  const code = country?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : DEFAULT_COUNTRY;
}

/** Local phrase for a region: AU state names, else the region's catalog city or the focus city. */
function regionLocalPhrase(country: string, regionCode: string, focusCity?: string | null): string | null {
  if (country === "AU") {
    const phrase = REGION_LOCAL_PHRASES[regionCode.toUpperCase()];
    if (phrase) return phrase;
  }
  const city = focusCity?.trim() || findCityByRegion(country, regionCode)?.city;
  return city ? city.toLowerCase() : null;
}

export function generateQueryCluster(
  keyword: string,
  regionCode?: string,
  country: string = DEFAULT_COUNTRY,
  focusCity?: string | null,
): GeneratedQuery[] {
  const core = keyword.trim().replace(/\s+/g, " ");
  if (!core) {
    throw new Error("Keyword is required");
  }
  const code = normalizeCampaignCountry(country);
  const place = countryName(code).toLowerCase();

  const queries: GeneratedQuery[] = [
    { text: core, type: "core", weight: 0.35 },
  ];

  const possessive = possessiveVariant(core);
  if (possessive) {
    queries.push({ text: possessive, type: "close_variation", weight: 0.15 });
  }

  const riding = ridingVariant(core);
  if (riding) {
    queries.push({ text: riding, type: "close_variation", weight: 0.12 });
  }

  queries.push(
    { text: `${core} online`, type: "close_variation", weight: 0.1 },
    { text: `${core} ${place}`, type: "local", weight: 0.15 },
  );

  if (regionCode && regionCode !== "ALL") {
    const phrase = regionLocalPhrase(code, regionCode, focusCity);
    if (phrase && !` ${core.toLowerCase()} `.includes(` ${phrase} `)) {
      queries.push({
        text: `${core} ${phrase}`,
        type: "local",
        weight: 0.12,
      });
    }
  }

  queries.push(
    { text: `buy ${core} online ${place}`, type: "long_tail", weight: 0.06 },
    { text: `best ${core} ${place}`, type: "long_tail", weight: 0.05 },
  );

  return normalizeWeights(dedupeQueries(queries));
}

export function extractTargetDomain(targetUrl: string): string {
  const hostname = new URL(targetUrl).hostname.replace(/^www\./, "");
  return hostname;
}

/** Schedule timezone: focus city, else region, else the country's largest catalog city. */
export function resolveRegionTimezone(
  regionCode?: string,
  country: string = DEFAULT_COUNTRY,
  focusCity?: string | null,
): string {
  const code = normalizeCampaignCountry(country);
  const fallback = code === "AU" ? "Australia/Adelaide" : (getCountry(code)?.cities[0]?.timezone ?? "UTC");
  const byCity = findCity(code, focusCity);
  if (byCity) return byCity.timezone;
  if (!regionCode || regionCode === "ALL") return fallback;
  return findCityByRegion(code, regionCode)?.timezone ?? fallback;
}

export function listRegionOptions(country: string = DEFAULT_COUNTRY): Array<{ code: string; label: string; city: string }> {
  return (getCountry(country)?.cities ?? []).map((region) => ({
    code: region.region,
    label: `${region.region} — ${region.city}`,
    city: region.city,
  }));
}

export function buildExperimentName(keyword: string, regionCode?: string): string {
  const regionLabel =
    regionCode && regionCode !== "ALL" ? ` (${regionCode})` : "";
  const title = keyword
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return `${title}${regionLabel}`;
}
