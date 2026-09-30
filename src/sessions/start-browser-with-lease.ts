import type {
  BrowserProfileProvider,
  RunningBrowser,
  StartProfileOptions,
} from "../providers/browser/BrowserProfileProvider.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "../providers/proxy/ProxyProvider.js";
import { WrongEgressGeoError } from "../browser/egress-geo.js";
import { FlaggedIpPrefixError } from "../providers/proxy/ip-reputation.js";

const MAX_LEASE_ATTEMPTS = 3;

/** Camoufox resolves the proxy's public IP before launch; this means the lease is dead. */
export function isProxyUnreachableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to get a public proxy IP/i.test(message);
}

/** Lease-specific failures: a different sticky IP is likely to succeed. */
function isBadLeaseError(error: unknown): boolean {
  return (
    isProxyUnreachableError(error) ||
    error instanceof WrongEgressGeoError ||
    error instanceof FlaggedIpPrefixError
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface StartWithLeaseInput<T> {
  proxyProvider: ProxyProvider;
  browserProvider: BrowserProfileProvider;
  profileId: string;
  allocation: ProxyAllocationRequest & { sessionKey: string };
  timezone?: string;
  options?: StartProfileOptions;
  /** Called with each lease id as soon as it is allocated, so outer cleanup can release it. */
  onLease: (leaseId: string | null) => void;
  /** Called with each started browser, so outer cleanup can stop it. */
  onRunning: (running: RunningBrowser | null) => void;
  /** Open the page and verify egress; bad-lease errors here trigger a fresh lease. */
  prepare: (running: RunningBrowser, lease: ProxyLease) => Promise<T>;
  /** Tear down a browser whose lease was rejected. */
  discard: (running: RunningBrowser) => Promise<void>;
}

/**
 * Allocate a lease, start the browser and verify egress; on a bad lease, discard it
 * and retry with a fresh sticky session (new IP) instead of failing the whole session.
 */
export async function startBrowserWithLeaseRetry<T>(
  input: StartWithLeaseInput<T>,
): Promise<{ lease: ProxyLease; running: RunningBrowser; prepared: T }> {
  for (let attempt = 1; ; attempt += 1) {
    const sessionKey =
      attempt === 1 ? input.allocation.sessionKey : `${input.allocation.sessionKey}r${attempt}`;
    const lease = await input.proxyProvider.allocate({ ...input.allocation, sessionKey });
    input.onLease(lease.leaseId);
    let running: RunningBrowser | null = null;
    try {
      running = await input.browserProvider.startProfile(
        input.profileId,
        {
          host: lease.host,
          port: lease.port,
          username: lease.username,
          password: lease.password,
          country: lease.country,
          region: lease.region,
          city: lease.city,
          sessionKey: lease.sessionKey,
          timezone: input.timezone,
        },
        input.options,
      );
      input.onRunning(running);
      const prepared = await input.prepare(running, lease);
      return { lease, running, prepared };
    } catch (error) {
      if (attempt >= MAX_LEASE_ATTEMPTS || !isBadLeaseError(error)) throw error;
      console.error(
        `[proxy] lease ${attempt}/${MAX_LEASE_ATTEMPTS} rejected (${errorMessage(error).slice(0, 120)}); drawing a fresh lease`,
      );
      if (running) {
        await input.discard(running).catch((discardError: unknown) => {
          console.error(`[proxy] browser discard failed: ${errorMessage(discardError)}`);
        });
        input.onRunning(null);
      }
      await input.proxyProvider.release(lease.leaseId).catch((releaseError: unknown) => {
        console.error(`[proxy] release failed: ${errorMessage(releaseError)}`);
      });
      input.onLease(null);
    }
  }
}
