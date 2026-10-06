import type { BrowserContext } from "./pw.js";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";
import { stablePointWithin } from "../providers/browser/camoufox-geo.js";
import { DEFAULT_COUNTRY, findCity, findCityByRegion, getCountry } from "../geo/locations.js";
import type { CityConfig } from "../geo/types.js";

function centreOf(row: CityConfig): GeoPoint {
  return { latitude: row.latitude, longitude: row.longitude };
}

/** Suburbs around the CBD, not the CBD itself: each identity keeps one "home" point. */
const CITY_SPREAD_KM = 8;

/**
 * Only www.google.com: google.com.au redirects there, and intercepting a redirected
 * navigation makes Firefox fail with NS_ERROR_REDIRECT_LOOP.
 */
const GOOGLE_HOSTS = /^https:\/\/www\.google\.com\//;

/** Undefined for custom cities outside the catalog (no known centre, so no header). */
export function cityGeoPoint(
  city: string | null | undefined,
  seed: string,
  country: string = DEFAULT_COUNTRY,
): GeoPoint | undefined {
  const row = findCity(country, city);
  return row ? stablePointWithin(centreOf(row), CITY_SPREAD_KM, seed) : undefined;
}

/** Validation location: campaign city, else its region's city, else the country's main city. */
export function preflightGeoPoint(
  country: string,
  region: string,
  city?: string | null,
): GeoPoint | undefined {
  const code = country.trim().toUpperCase() || DEFAULT_COUNTRY;
  const fallback = code === "AU" ? findCity("AU", "Adelaide") : getCountry(code)?.cities[0];
  const row = findCity(code, city) ?? findCityByRegion(code, region) ?? fallback;
  return row ? centreOf(row) : undefined;
}

/** Google's device-location header format (what its own apps send), as used by gslocation. */
export function encodeXGeo(point: GeoPoint): string {
  const text =
    "role: CURRENT_LOCATION\nproducer: DEVICE_LOCATION\nradius: 65000\nlatlng <\n" +
    `  latitude_e7: ${Math.floor(point.latitude * 1e7)}\n  longitude_e7: ${Math.floor(point.longitude * 1e7)}\n>`;
  return `a ${Buffer.from(text).toString("base64")}`;
}

const currentHeader = new WeakMap<BrowserContext, string>();

/**
 * Google remembers the last location per profile, so every Google request carries this point.
 * The route is registered once per context and later calls only swap the point: unroute +
 * route in Firefox leaves page requests hanging (search box clicks never complete).
 */
export async function applyGoogleGeoHeader(context: BrowserContext, point: GeoPoint): Promise<void> {
  const registered = currentHeader.has(context);
  currentHeader.set(context, encodeXGeo(point));
  if (registered) return;
  await context.route(GOOGLE_HOSTS, (route) => {
    const header = currentHeader.get(context);
    const headers = route.request().headers();
    return route.continue({ headers: header ? { ...headers, "x-geo": header } : headers });
  });
}
