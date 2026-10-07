import { ProfileProvider } from "@prisma/client";
import { prisma } from "../db/client.js";
import { resolveCampaignCity } from "../campaign/geo-capacity.js";
import { DEFAULT_COUNTRY } from "../geo/locations.js";
import { mobileIdentitiesAvailable } from "../identities/provider-compat.js";

const SETTING_KEY = "warm_pool_targets";
export const MAX_WARM_POOL_TARGET = 50;

export const POOL_DEVICES = ["desktop", "mobile"] as const;
export type PoolDevice = (typeof POOL_DEVICES)[number];
export type DeviceTargets = Record<PoolDevice, number>;

/**
 * Pool key → how many Camoufox identities per device to keep warming or warm (eligible).
 * Keys are "City" for Australia (the original format) or "CC:City" for other countries.
 * Stored values may be a bare number (pre-mobile format = desktop only).
 */
export type WarmPoolTargets = Record<string, DeviceTargets>;

export interface DevicePoolStatus {
  target: number;
  warming: number;
  eligible: number;
}

export interface WarmPoolCityStatus {
  key: string;
  country: string;
  city: string;
  desktop: DevicePoolStatus;
  mobile: DevicePoolStatus;
}

function clampTarget(value: unknown, label: string): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Invalid target for ${label}`);
  return Math.min(MAX_WARM_POOL_TARGET, Math.round(number));
}

/** Bare number = desktop target; object = per-device targets. */
function toDeviceTargets(value: unknown, label: string): DeviceTargets {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return { desktop: clampTarget(record.desktop, label), mobile: clampTarget(record.mobile, label) };
  }
  return { desktop: clampTarget(value, label), mobile: 0 };
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
      const device = toDeviceTargets(value, key);
      if (device.desktop + device.mobile > 0) targets[key] = device;
    }
    return targets;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[warm-pool] Ignoring unreadable ${SETTING_KEY}: ${message}`);
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
    const device = toDeviceTargets(rawValue, rawKey);
    if (device.mobile > 0 && !mobileIdentitiesAvailable()) {
      throw new Error("Mobile targets need a mobile proxy pool (set MOBILE_PROXY_PROVIDER)");
    }
    if (device.desktop + device.mobile > 0) targets[warmPoolKey(country, config.city)] = device;
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
  country: string,
  deviceClass: PoolDevice,
): Promise<{ warming: number; eligible: number }> {
  const rows = await prisma.identity.groupBy({
    by: ["warmupStatus"],
    where: { city, country, deviceClass, active: true, profileProvider: ProfileProvider.camoufox },
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
    statuses.push({
      key,
      country,
      city,
      desktop: { target: target.desktop, ...(await countPoolIdentities(city, country, "desktop")) },
      mobile: { target: target.mobile, ...(await countPoolIdentities(city, country, "mobile")) },
    });
  }
  return statuses;
}
