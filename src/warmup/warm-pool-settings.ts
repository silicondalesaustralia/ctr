import { ProfileProvider } from "@prisma/client";
import { prisma } from "../db/client.js";
import { findRegionConfigByCity } from "../identities/regions.js";

const SETTING_KEY = "warm_pool_targets";
export const MAX_WARM_POOL_TARGET = 50;

/** City → how many Camoufox identities to keep warming or warm (eligible). */
export type WarmPoolTargets = Record<string, number>;

export interface WarmPoolCityStatus {
  city: string;
  target: number;
  warming: number;
  eligible: number;
}

export async function getWarmPoolTargets(): Promise<WarmPoolTargets> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object") return {};
    const targets: WarmPoolTargets = {};
    for (const [city, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isInteger(value) && value > 0) targets[city] = value;
    }
    return targets;
  } catch {
    return {};
  }
}

/** Validates cities and clamps counts; zero removes a city. */
export async function setWarmPoolTargets(input: Record<string, unknown>): Promise<WarmPoolTargets> {
  const targets: WarmPoolTargets = {};
  for (const [rawCity, rawValue] of Object.entries(input)) {
    const config = findRegionConfigByCity(rawCity);
    if (!config) throw new Error(`Unknown city: ${rawCity}`);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid target for ${rawCity}`);
    const count = Math.min(MAX_WARM_POOL_TARGET, Math.round(value));
    if (count > 0) targets[config.city] = count;
  }
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(targets) },
    update: { value: JSON.stringify(targets) },
  });
  return targets;
}

export async function countPoolIdentities(city: string): Promise<{ warming: number; eligible: number }> {
  const rows = await prisma.identity.groupBy({
    by: ["warmupStatus"],
    where: { city, active: true, profileProvider: ProfileProvider.camoufox },
    _count: { _all: true },
  });
  const count = (status: string) =>
    rows.find((row) => row.warmupStatus === status)?._count._all ?? 0;
  return { warming: count("warming"), eligible: count("eligible") };
}

export async function getWarmPoolStatus(): Promise<WarmPoolCityStatus[]> {
  const targets = await getWarmPoolTargets();
  const statuses: WarmPoolCityStatus[] = [];
  for (const [city, target] of Object.entries(targets)) {
    statuses.push({ city, target, ...(await countPoolIdentities(city)) });
  }
  return statuses;
}
