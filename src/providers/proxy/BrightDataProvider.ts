import { randomUUID } from "node:crypto";
import { getEnv } from "../../config/env.js";
import { buildBrightDataUsername, type BrightDataEndpoint } from "./brightdata-utils.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

export function resolveBrightDataEndpoint(): BrightDataEndpoint {
  const env = getEnv();
  const baseUsername = env.BRIGHTDATA_PROXY_USERNAME;
  const password = env.BRIGHTDATA_PROXY_PASSWORD;
  if (!baseUsername || !password) {
    throw new Error("Bright Data proxy credentials are not configured");
  }
  return { host: env.BRIGHTDATA_PROXY_HOST, port: Number(env.BRIGHTDATA_PROXY_PORT), baseUsername, password };
}

/** Bright Data mobile zone: sticky carrier IPs, targeted by country, city and ASN in the username. */
export class BrightDataProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const endpoint = resolveBrightDataEndpoint();
    const sessionKey = input.sessionKey ?? randomUUID().slice(0, 12);
    const country = (input.country || "AU").toUpperCase();
    const lease: ProxyLease = {
      leaseId: randomUUID(),
      host: endpoint.host,
      port: endpoint.port,
      username: buildBrightDataUsername(endpoint.baseUsername, { ...input, country, sessionKey }),
      password: endpoint.password,
      country,
      region: input.region,
      city: input.city,
      sessionKey,
      proxyType: "mobile",
    };
    activeLeases.set(lease.leaseId, lease);
    return lease;
  }

  async release(leaseId: string): Promise<void> {
    activeLeases.delete(leaseId);
  }
}
