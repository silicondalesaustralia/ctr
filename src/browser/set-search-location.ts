import type { BrowserContext } from "./pw.js";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";
import { getEnv } from "../config/env.js";
import { applyGoogleGeoHeader, GOOGLE_HOSTS } from "./google-geo-header.js";

/**
 * Move an open browser to a new search location: device GPS and Google's x-geo header
 * both follow, so one session can search from many points (coverage grid).
 * Geolocation permission must already be granted (launch with a geoPoint).
 */
export async function setSearchLocation(context: BrowserContext, point: GeoPoint): Promise<void> {
  await context.setGeolocation({ ...point, accuracy: 30 });
  if (!getEnv().GOOGLE_XGEO_ENABLED) return;
  await context.unroute(GOOGLE_HOSTS);
  await applyGoogleGeoHeader(context, point);
}
