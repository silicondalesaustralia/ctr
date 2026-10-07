import { DEFAULT_COUNTRY } from "./geo";

export type PoolDevice = "desktop" | "mobile";
export type DeviceTargetInputs = Record<PoolDevice, string>;

export interface DevicePoolStatus {
  target: number;
  warming: number;
  eligible: number;
}

export interface WarmPoolCity {
  key: string;
  country: string;
  city: string;
  desktop: DevicePoolStatus;
  mobile: DevicePoolStatus;
}

export interface WarmPoolResponse {
  provider: string;
  mobileAvailable: boolean;
  cities: WarmPoolCity[];
}

/** Pre-mobile API: { city, target, warming, eligible } per row, desktop only. */
interface LegacyWarmPoolCity {
  key?: string;
  country?: string;
  city: string;
  target: number;
  warming: number;
  eligible: number;
}

export interface RawWarmPoolResponse {
  provider: string;
  mobileAvailable?: boolean;
  cities: Array<WarmPoolCity | LegacyWarmPoolCity>;
}

export function warmPoolKey(country: string, city: string): string {
  return country === DEFAULT_COUNTRY ? city : `${country}:${city}`;
}

export function normalizePool(raw: RawWarmPoolResponse): WarmPoolResponse {
  const empty = { target: 0, warming: 0, eligible: 0 };
  return {
    provider: raw.provider,
    mobileAvailable: raw.mobileAvailable ?? false,
    cities: raw.cities.map((row) =>
      "desktop" in row
        ? row
        : {
            key: row.key ?? row.city,
            country: row.country ?? DEFAULT_COUNTRY,
            city: row.city,
            desktop: { target: row.target, warming: row.warming, eligible: row.eligible },
            mobile: empty,
          },
    ),
  };
}
