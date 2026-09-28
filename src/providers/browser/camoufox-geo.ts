import { createHash } from "node:crypto";
import { publicIP, validIPv4, validIPv6 } from "camoufox-js/dist/ip.js";
import { getGeolocation } from "camoufox-js/dist/locale.js";
import type { ProxyConfig } from "../proxy/ProxyProvider.js";
import type { GeoPoint } from "./BrowserProfileProvider.js";

const KM_PER_DEGREE_LAT = 111.32;

export interface CamoufoxGeoResult {
  egressIp: string;
  config: Record<string, string | number>;
  firefoxPrefs: Record<string, boolean | number>;
}

export function proxyUrl(proxy: ProxyConfig): string {
  return `http://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
}

/**
 * Deterministic point within radiusKm of centre — same seed always lands on the
 * same "house", so an identity keeps one location per campaign.
 */
export function stablePointWithin(center: GeoPoint, radiusKm: number, seed: string): GeoPoint {
  const hash = createHash("sha256").update(seed).digest();
  const u = hash.readUInt32BE(0) / 0xffffffff;
  const v = hash.readUInt32BE(4) / 0xffffffff;
  const distanceKm = radiusKm * Math.sqrt(u);
  const bearing = 2 * Math.PI * v;
  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEGREE_LAT;
  const dLng =
    (distanceKm * Math.sin(bearing)) /
    (KM_PER_DEGREE_LAT * Math.cos((center.latitude * Math.PI) / 180));
  return {
    latitude: Number((center.latitude + dLat).toFixed(6)),
    longitude: Number((center.longitude + dLng).toFixed(6)),
  };
}

const DEFAULT_RADIUS_KM = 3;

/** Campaign GPS point for one identity, or undefined when the campaign has no centre set. */
export function campaignGeoPoint(
  campaign: { id: string; geoLatitude: number | null; geoLongitude: number | null; geoRadiusKm: number | null },
  identityExternalId: string,
): GeoPoint | undefined {
  if (campaign.geoLatitude === null || campaign.geoLongitude === null) return undefined;
  return stablePointWithin(
    { latitude: campaign.geoLatitude, longitude: campaign.geoLongitude },
    campaign.geoRadiusKm ?? DEFAULT_RADIUS_KM,
    `${identityExternalId}:${campaign.id}`,
  );
}

/**
 * Resolve the proxy's public IP, then build Camoufox geo config: timezone/locale
 * from the IP, WebRTC pinned to the IP, and GPS from geoPoint when provided.
 */
export async function buildCamoufoxGeo(
  proxy: ProxyConfig | undefined,
  geoPoint?: GeoPoint,
): Promise<CamoufoxGeoResult> {
  const egressIp = await publicIP(proxy ? proxyUrl(proxy) : undefined);
  const geo = await getGeolocation(egressIp);
  const config: Record<string, string | number> = { ...geo.asConfig() };
  const firefoxPrefs: Record<string, boolean | number> = {};

  if (validIPv4(egressIp)) {
    config["webrtc:ipv4"] = egressIp;
    firefoxPrefs["network.dns.disableIPv6"] = true;
  } else if (validIPv6(egressIp)) {
    config["webrtc:ipv6"] = egressIp;
  }

  if (geoPoint) {
    // Playwright grantPermissions alone leaves Firefox's geo prompt pending forever.
    firefoxPrefs["permissions.default.geo"] = 1;
    firefoxPrefs["geo.prompt.testing"] = true;
    firefoxPrefs["geo.prompt.testing.allow"] = true;
    config["geolocation:latitude"] = geoPoint.latitude;
    config["geolocation:longitude"] = geoPoint.longitude;
    config["geolocation:accuracy"] = 20 + (Math.abs(Math.round(geoPoint.latitude * 1e5)) % 40);
  }

  return { egressIp, config, firefoxPrefs };
}
