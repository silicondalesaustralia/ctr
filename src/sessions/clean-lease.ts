import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "../providers/proxy/ProxyProvider.js";
import { WrongEgressGeoError } from "../browser/egress-geo.js";
import { getEnv, isDryRun } from "../config/env.js";
import { BadGeoPrefixError } from "../providers/proxy/bad-geo-prefixes.js";
import { FlaggedIpPrefixError } from "../providers/proxy/ip-reputation.js";
import {
  checkLeaseBeforeLaunch,
  LeaseUnreachableError,
  recordLeaseRejection,
  UnstableLeaseError,
} from "../providers/proxy/lease-check.js";
import { shouldSkipCityTargeting } from "../providers/proxy/premiumports-utils.js";

/** Bad leases are cheap to reject before launch, so keep drawing well past a bad patch of a pool. */
export const MAX_LEASE_ATTEMPTS = 8;

/** Every lease drawn was bad; callers defer the work instead of recording a failure. */
export class ProxyPoolExhaustedError extends Error {
  constructor(area: string, lastError: string) {
    super(`Proxy pool exhausted: no clean ${area} IP after ${MAX_LEASE_ATTEMPTS} leases (last: ${lastError.slice(0, 160)})`);
    this.name = "ProxyPoolExhaustedError";
  }
}

/** Camoufox resolves the proxy's public IP before launch; this means the lease is dead. */
export function isProxyUnreachableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to get a public proxy IP/i.test(message);
}

/** Lease-specific failures: a different sticky IP is likely to succeed. */
export function isBadLeaseError(error: unknown): boolean {
  return (
    isProxyUnreachableError(error) ||
    error instanceof LeaseUnreachableError ||
    error instanceof WrongEgressGeoError ||
    error instanceof UnstableLeaseError ||
    error instanceof FlaggedIpPrefixError ||
    error instanceof BadGeoPrefixError
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** City the lease must egress in (undefined = country only), and whether to test leases at all. */
export function leaseTarget(city: string | undefined): { expectedCity?: string; checkLeases: boolean } {
  return {
    expectedCity: shouldSkipCityTargeting(city) ? undefined : city,
    checkLeases: !isDryRun() && getEnv().PROXY_PROVIDER !== "mock",
  };
}

/** Log a rejected lease and remember its /24 so later allocations skip it. */
export async function rejectLease(error: unknown, attempt: number, expectedCity: string | undefined): Promise<void> {
  console.error(`[proxy] lease ${attempt}/${MAX_LEASE_ATTEMPTS} rejected (${errorMessage(error).slice(0, 120)})`);
  await recordLeaseRejection(error, expectedCity);
}

/** Draw leases until one passes the pre-launch check, for callers that start the browser themselves. */
export async function allocateCleanLease(
  proxyProvider: ProxyProvider,
  allocation: ProxyAllocationRequest & { sessionKey: string },
): Promise<ProxyLease> {
  const { expectedCity, checkLeases } = leaseTarget(allocation.city);
  for (let attempt = 1; ; attempt += 1) {
    const sessionKey = attempt === 1 ? allocation.sessionKey : `${allocation.sessionKey}r${attempt}`;
    const lease = await proxyProvider.allocate({ ...allocation, sessionKey });
    if (!checkLeases) return lease;
    try {
      await checkLeaseBeforeLaunch(lease, expectedCity);
      return lease;
    } catch (error) {
      if (!isBadLeaseError(error)) throw error;
      await rejectLease(error, attempt, expectedCity);
      await proxyProvider.release(lease.leaseId).catch((releaseError: unknown) => {
        console.error(`[proxy] release failed: ${errorMessage(releaseError)}`);
      });
      if (attempt >= MAX_LEASE_ATTEMPTS) {
        throw new ProxyPoolExhaustedError(expectedCity ?? allocation.country, errorMessage(error));
      }
    }
  }
}
