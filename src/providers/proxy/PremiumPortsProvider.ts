import { randomUUID } from "node:crypto";
import { getEnv } from "../../config/env.js";
import {
  buildPremiumPortsUsername,
  type PremiumPortsEndpoint,
} from "./premiumports-utils.js";
import type {
  ProxyAllocationRequest,
  ProxyLease,
  ProxyProvider,
} from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

function resolvePremiumPortsEndpoint(): PremiumPortsEndpoint {
  const env = getEnv();
  const host = env.PREMIUMPORTS_PROXY_HOST;
  const port = env.PREMIUMPORTS_PROXY_PORT;
  const baseUsername = env.PREMIUMPORTS_PROXY_USERNAME;
  const password = env.PREMIUMPORTS_PROXY_PASSWORD;

  if (!host || !port || !baseUsername || !password) {
    throw new Error("Premium Ports proxy credentials are not configured");
  }

  return {
    host,
    port: Number(port),
    baseUsername,
    password,
  };
}

export class PremiumPortsProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const endpoint = resolvePremiumPortsEndpoint();
    const sessionKey = input.sessionKey ?? randomUUID().slice(0, 12);
    const username = buildPremiumPortsUsername(endpoint.baseUsername, {
      ...input,
      country: input.country || "AU",
      sessionKey,
    });

    const leaseId = randomUUID();
    const lease: ProxyLease = {
      leaseId,
      host: endpoint.host,
      port: endpoint.port,
      username,
      password: endpoint.password,
      country: "AU",
      region: input.region,
      city: input.city,
      sessionKey,
      proxyType: input.deviceClass === "mobile" ? "mobile" : "residential",
    };

    activeLeases.set(leaseId, lease);
    return lease;
  }

  async release(leaseId: string): Promise<void> {
    activeLeases.delete(leaseId);
  }
}

export { buildPremiumPortsUsername, resolvePremiumPortsEndpoint };
