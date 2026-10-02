import type { BrowserContext } from "./pw.js";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";
import { stablePointWithin } from "../providers/browser/camoufox-geo.js";

const CITY_CENTRES: Record<string, GeoPoint> = {
  adelaide: { latitude: -34.9285, longitude: 138.6007 },
  brisbane: { latitude: -27.4698, longitude: 153.0251 },
  canberra: { latitude: -35.2809, longitude: 149.13 },
  darwin: { latitude: -12.4634, longitude: 130.8456 },
  hobart: { latitude: -42.8821, longitude: 147.3272 },
  melbourne: { latitude: -37.8136, longitude: 144.9631 },
  perth: { latitude: -31.9523, longitude: 115.8613 },
  sydney: { latitude: -33.8688, longitude: 151.2093 },
};

const REGION_CAPITALS: Record<string, string> = {
  SA: "Adelaide", QLD: "Brisbane", ACT: "Canberra", NT: "Darwin",
  TAS: "Hobart", VIC: "Melbourne", WA: "Perth", NSW: "Sydney",
};

/** Suburbs around the CBD, not the CBD itself: each identity keeps one "home" point. */
const CITY_SPREAD_KM = 8;

/** Only Google search hosts; the target site and everything else never see the header. */
const GOOGLE_HOSTS = /^https:\/\/www\.google\.com(\.au)?\//;

export function cityGeoPoint(city: string | null | undefined, seed: string): GeoPoint | undefined {
  const centre = city ? CITY_CENTRES[city.trim().toLowerCase()] : undefined;
  return centre ? stablePointWithin(centre, CITY_SPREAD_KM, seed) : undefined;
}

/** Validation location: campaign city, else its region's capital, else Adelaide (All Australia). */
export function preflightGeoPoint(region: string, city?: string | null): GeoPoint {
  const name = city?.trim() || REGION_CAPITALS[region.trim().toUpperCase()] || "Adelaide";
  return CITY_CENTRES[name.toLowerCase()] ?? CITY_CENTRES.adelaide!;
}

/** Google's device-location header format (what its own apps send), as used by gslocation. */
export function encodeXGeo(point: GeoPoint): string {
  const text =
    "role: CURRENT_LOCATION\nproducer: DEVICE_LOCATION\nradius: 65000\nlatlng <\n" +
    `  latitude_e7: ${Math.floor(point.latitude * 1e7)}\n  longitude_e7: ${Math.floor(point.longitude * 1e7)}\n>`;
  return `a ${Buffer.from(text).toString("base64")}`;
}

/** Google remembers the last location per profile, so every Google request carries this point. */
export async function applyGoogleGeoHeader(context: BrowserContext, point: GeoPoint): Promise<void> {
  const header = encodeXGeo(point);
  await context.route(GOOGLE_HOSTS, (route) =>
    route.continue({ headers: { ...route.request().headers(), "x-geo": header } }),
  );
}
