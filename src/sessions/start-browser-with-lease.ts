import type {
  BrowserProfileProvider,
  RunningBrowser,
  StartProfileOptions,
} from "../providers/browser/BrowserProfileProvider.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "../providers/proxy/ProxyProvider.js";
import { checkLeaseBeforeLaunch } from "../providers/proxy/lease-check.js";
import {
  errorMessage,
  isBadLeaseError,
  leaseTarget,
  MAX_LEASE_ATTEMPTS,
  ProxyPoolExhaustedError,
  rejectLease,
} from "./clean-lease.js";

export interface StartWithLeaseInput<T> {
  proxyProvider: ProxyProvider;
  browserProvider: BrowserProfileProvider;
  profileId: string;
  allocation: ProxyAllocationRequest & { sessionKey: string };
  timezone?: string;
  locale?: string;
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
  const { expectedCity, checkLeases } = leaseTarget(input.allocation.city, input.allocation.deviceClass);
  for (let attempt = 1; ; attempt += 1) {
    const sessionKey =
      attempt === 1 ? input.allocation.sessionKey : `${input.allocation.sessionKey}r${attempt}`;
    const lease = await input.proxyProvider.allocate({ ...input.allocation, sessionKey });
    input.onLease(lease.leaseId);
    let running: RunningBrowser | null = null;
    try {
      if (checkLeases) await checkLeaseBeforeLaunch(lease, expectedCity);
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
          locale: input.locale,
        },
        input.options,
      );
      input.onRunning(running);
      const prepared = await input.prepare(running, lease);
      return { lease, running, prepared };
    } catch (error) {
      if (!isBadLeaseError(error)) throw error;
      await rejectLease(error, attempt, expectedCity, lease);
      await releaseRejected(input, lease, running);
      if (attempt >= MAX_LEASE_ATTEMPTS) {
        throw new ProxyPoolExhaustedError(expectedCity ?? input.allocation.country, errorMessage(error));
      }
    }
  }
}

async function releaseRejected<T>(
  input: StartWithLeaseInput<T>,
  lease: ProxyLease,
  running: RunningBrowser | null,
): Promise<void> {
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
