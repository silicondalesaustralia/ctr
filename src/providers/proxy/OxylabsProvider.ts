import { randomUUID } from "node:crypto";
import { getEnv } from "../../config/env.js";
import { buildOxylabsUsername, type OxylabsEndpoint } from "./oxylabs-utils.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

export function resolveOxylabsEndpoint(): OxylabsEndpoint {
  const env = getEnv();
  const baseUsername = env.OXYLABS_PROXY_USERNAME;
  const password = env.OXYLABS_PROXY_PASSWORD;
  if (!baseUsername || !password) {
    throw new Error("Oxylabs proxy credentials are not configured");
  }
  return { host: env.OXYLABS_PROXY_HOST, port: Number(env.OXYLABS_PROXY_PORT), baseUsername, password };
}

/** Oxylabs Mobile Proxies: sticky carrier IPs, targeted by country and city in the username. */
export class OxylabsProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const endpoint = resolveOxylabsEndpoint();
    const sessionKey = input.sessionKey ?? randomUUID().slice(0, 12);
    const country = (input.country || "AU").toUpperCase();
    const lease: ProxyLease = {
      leaseId: randomUUID(),
      host: endpoint.host,
      port: endpoint.port,
      username: buildOxylabsUsername(endpoint.baseUsername, { ...input, country, sessionKey }),
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
