import type {
  BrowserProfileProvider,
  RunningBrowser,
  StartProfileOptions,
} from "../providers/browser/BrowserProfileProvider.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "../providers/proxy/ProxyProvider.js";

const MAX_LEASE_ATTEMPTS = 3;

/** Camoufox resolves the proxy's public IP before launch; this means the lease is dead. */
export function isProxyUnreachableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to get a public proxy IP/i.test(message);
}

export interface StartWithLeaseInput {
  proxyProvider: ProxyProvider;
  browserProvider: BrowserProfileProvider;
  profileId: string;
  allocation: ProxyAllocationRequest & { sessionKey: string };
  timezone?: string;
  options?: StartProfileOptions;
  /** Called with each lease id as soon as it is allocated, so outer cleanup can release it. */
  onLease: (leaseId: string | null) => void;
}

/**
 * Allocate a lease and start the browser; on an unreachable proxy, release it and
 * retry with a fresh sticky session (new IP) instead of failing the whole session.
 */
export async function startBrowserWithLeaseRetry(
  input: StartWithLeaseInput,
): Promise<{ lease: ProxyLease; running: RunningBrowser }> {
  for (let attempt = 1; ; attempt += 1) {
    const sessionKey =
      attempt === 1 ? input.allocation.sessionKey : `${input.allocation.sessionKey}r${attempt}`;
    const lease = await input.proxyProvider.allocate({ ...input.allocation, sessionKey });
    input.onLease(lease.leaseId);
    try {
      const running = await input.browserProvider.startProfile(
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
      return { lease, running };
    } catch (error) {
      if (attempt >= MAX_LEASE_ATTEMPTS || !isProxyUnreachableError(error)) throw error;
      console.error(`[proxy] lease ${attempt}/${MAX_LEASE_ATTEMPTS} unreachable; drawing a fresh lease`);
      await input.proxyProvider.release(lease.leaseId).catch((releaseError: unknown) => {
        const message = releaseError instanceof Error ? releaseError.message : String(releaseError);
        console.error(`[proxy] release failed: ${message}`);
      });
      input.onLease(null);
    }
  }
}
