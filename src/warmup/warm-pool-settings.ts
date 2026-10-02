import { ProfileProvider } from "@prisma/client";
import { prisma } from "../db/client.js";
import { resolveCampaignCity } from "../campaign/geo-capacity.js";
import { DEFAULT_COUNTRY } from "../geo/locations.js";

const SETTING_KEY = "warm_pool_targets";
export const MAX_WARM_POOL_TARGET = 50;

/**
 * Pool key → how many Camoufox identities to keep warming or warm (eligible).
 * Keys are "City" for Australia (the original format) or "CC:City" for other countries.
 */
export type WarmPoolTargets = Record<string, number>;

export interface WarmPoolCityStatus {
  key: string;
  country: string;
  city: string;
  target: number;
  warming: number;
  eligible: number;
}

export function warmPoolKey(country: string, city: string): string {
  const code = country.trim().toUpperCase() || DEFAULT_COUNTRY;
  return code === DEFAULT_COUNTRY ? city : `${code}:${city}`;
}

export function parseWarmPoolKey(key: string): { country: string; city: string } {
  const match = /^([A-Za-z]{2}):(.+)$/.exec(key);
  return match
    ? { country: match[1]!.toUpperCase(), city: match[2]!.trim() }
    : { country: DEFAULT_COUNTRY, city: key.trim() };
}

export async function getWarmPoolTargets(): Promise<WarmPoolTargets> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object") return {};
    const targets: WarmPoolTargets = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isInteger(value) && value > 0) targets[key] = value;
    }
    return targets;
  } catch {
    return {};
  }
}

/** Validates cities (catalog, or custom cities that already have identities) and clamps counts; zero removes one. */
export async function setWarmPoolTargets(input: Record<string, unknown>): Promise<WarmPoolTargets> {
  const targets: WarmPoolTargets = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const { country, city } = parseWarmPoolKey(rawKey);
    const config = await resolveCampaignCity(city, country);
    if (!config) throw new Error(`Unknown city for ${country}: ${city}`);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid target for ${rawKey}`);
    const count = Math.min(MAX_WARM_POOL_TARGET, Math.round(value));
    if (count > 0) targets[warmPoolKey(country, config.city)] = count;
  }
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(targets) },
    update: { value: JSON.stringify(targets) },
  });
  return targets;
}

export async function countPoolIdentities(
  city: string,
  country: string = DEFAULT_COUNTRY,
): Promise<{ warming: number; eligible: number }> {
  const rows = await prisma.identity.groupBy({
    by: ["warmupStatus"],
    where: { city, country, active: true, profileProvider: ProfileProvider.camoufox },
    _count: { _all: true },
  });
  const count = (status: string) =>
    rows.find((row) => row.warmupStatus === status)?._count._all ?? 0;
  return { warming: count("warming"), eligible: count("eligible") };
}

export async function getWarmPoolStatus(): Promise<WarmPoolCityStatus[]> {
  const targets = await getWarmPoolTargets();
  const statuses: WarmPoolCityStatus[] = [];
  for (const [key, target] of Object.entries(targets)) {
    const { country, city } = parseWarmPoolKey(key);
    statuses.push({ key, country, city, target, ...(await countPoolIdentities(city, country)) });
  }
  return statuses;
}
