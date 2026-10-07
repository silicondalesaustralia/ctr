import {
  assertExpectedCountry,
  normalizeCityName,
  parseEgressGeoPayload,
  WrongEgressGeoError,
  type EgressGeo,
  type IpLookupPayload,
} from "../../browser/egress-geo.js";
import { isSameMetro } from "../../browser/metro-aliases.js";
import { sleep } from "../../utils/helpers.js";
import { ANY_CITY, assertGeoPrefixClean, geoScope, recordBadGeoPrefix } from "./bad-geo-prefixes.js";
import { assertEgressPrefixClean, ipPrefix } from "./ip-reputation.js";
import { fetchJsonViaProxy } from "./proxy-http.js";
import type { ProxyLease } from "./ProxyProvider.js";

const IP_API_URL = "http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,query";
const IPINFO_URL = "https://ipinfo.io/json";
/** Gap between the two lookups, so a lease that rotates per request shows a second IP. */
const STABILITY_GAP_MS = 2_000;

/** The proxy didn't answer at all; message matches isProxyUnreachableError for retry handling. */
export class LeaseUnreachableError extends Error {
  constructor(cause: string) {
    super(`Lease check failed to get a public proxy IP: ${cause}`);
    this.name = "LeaseUnreachableError";
  }
}

/** A sticky lease that changed IP between two requests would also change IP mid-session. */
export class UnstableLeaseError extends Error {
  constructor(readonly firstIp: string, readonly secondIp: string) {
    super(`Proxy egress geo mismatch: sticky lease rotated ${firstIp} -> ${secondIp}`);
    this.name = "UnstableLeaseError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function lookup(lease: ProxyLease, url: string, source: string): Promise<EgressGeo> {
  return parseEgressGeoPayload((await fetchJsonViaProxy(lease, url)) as IpLookupPayload, source);
}

/**
 * Test a lease before any browser starts: two geo services must both report the lease's
 * country, at least one must place it in the expected metro, and both must see the same IP.
 */
export async function checkLeaseBeforeLaunch(lease: ProxyLease, expectedCity?: string): Promise<EgressGeo> {
  let first: EgressGeo;
  try {
    first = await lookup(lease, IP_API_URL, "ip-api.com (lease check)");
  } catch (error) {
    throw new LeaseUnreachableError(errorMessage(error));
  }
  const mobile = lease.proxyType === "mobile";
  await assertEgressPrefixClean(first.ip, mobile);
  if (!mobile) await assertGeoPrefixClean(first.ip, expectedCity);

  await sleep(STABILITY_GAP_MS);
  const second = await lookup(lease, IPINFO_URL, "ipinfo.io (lease check)").catch((error: unknown) => {
    console.error(`[proxy] lease check: ipinfo lookup failed (${errorMessage(error)}); using ip-api only`);
    return null;
  });
  if (second && second.ip !== first.ip) throw new UnstableLeaseError(first.ip, second.ip);

  const lookups = second ? [first, second] : [first];
  for (const geo of lookups) assertExpectedCountry(geo, lease.country);
  if (expectedCity?.trim()) {
    const want = normalizeCityName(expectedCity);
    const inMetro = lookups.some((geo) => geo.city && isSameMetro(want, normalizeCityName(geo.city)));
    if (!inMetro) throw new WrongEgressGeoError(second ?? first, lease.country, expectedCity);
  }
  console.error(
    `[proxy] lease check ok ip=${first.ip} ${lookups.map((geo) => `${geo.country}/${geo.city ?? "?"}`).join(" ")}`,
  );
  return first;
}

/** Remember the /24 behind a rejected lease so later allocations skip it (not for mobile CGNAT ranges). */
export async function recordLeaseRejection(error: unknown, city?: string, mobile = false): Promise<void> {
  if (mobile) return;
  if (error instanceof UnstableLeaseError) {
    const rotation = `${error.firstIp} -> ${error.secondIp}`;
    await recordBadGeoPrefix(error.firstIp, ANY_CITY, "unstable", rotation);
    if (ipPrefix(error.secondIp) !== ipPrefix(error.firstIp)) {
      await recordBadGeoPrefix(error.secondIp, ANY_CITY, "unstable", rotation);
    }
    return;
  }
  if (!(error instanceof WrongEgressGeoError)) return;
  const leftCountry = error.egress.country.toUpperCase() !== error.expectedCountry.toUpperCase();
  const where = `${error.egress.country}/${error.egress.city ?? "?"} via ${error.egress.source}`;
  await recordBadGeoPrefix(error.egress.ip, leftCountry ? ANY_CITY : geoScope(city), "wrong_geo", where);
}
