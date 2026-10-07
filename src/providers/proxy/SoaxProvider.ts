import { randomUUID } from "node:crypto";
import { getEnv } from "../../config/env.js";
import { buildSoaxUsername, type SoaxEndpoint } from "./soax-utils.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

export function resolveSoaxEndpoint(): SoaxEndpoint {
  const env = getEnv();
  const packageKey = env.SOAX_PACKAGE_KEY;
  if (!packageKey) {
    throw new Error("SOAX package key is not configured");
  }
  return { host: env.SOAX_PROXY_HOST, port: Number(env.SOAX_PROXY_PORT), network: env.SOAX_NETWORK, packageKey };
}

/** SOAX: rules (network, geo, ASN, session) in the username, package key as the password. */
export class SoaxProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const endpoint = resolveSoaxEndpoint();
    const sessionKey = input.sessionKey ?? randomUUID().slice(0, 12);
    const country = (input.country || "AU").toUpperCase();
    const city = getEnv().SOAX_CITY_TARGETING ? input.city : undefined;
    const lease: ProxyLease = {
      leaseId: randomUUID(),
      host: endpoint.host,
      port: endpoint.port,
      username: buildSoaxUsername(endpoint.network, { ...input, country, city, sessionKey }),
      password: endpoint.packageKey,
      country,
      region: input.region,
      city: input.city,
      sessionKey,
      proxyType: endpoint.network === "res" ? "residential" : "mobile",
    };
    activeLeases.set(lease.leaseId, lease);
    return lease;
  }

  async release(leaseId: string): Promise<void> {
    activeLeases.delete(leaseId);
  }
}
