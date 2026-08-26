import { randomUUID } from "node:crypto";
import { getEnv } from "../../config/env.js";
import type {
  ProxyAllocationRequest,
  ProxyLease,
  ProxyProvider,
} from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

export class DecodoProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const env = getEnv();
    const host = env.DECODO_PROXY_HOST;
    const port = env.DECODO_PROXY_PORT;
    const baseUsername = env.DECODO_PROXY_USERNAME;
    const password = env.DECODO_PROXY_PASSWORD;

    if (!host || !port || !baseUsername || !password) {
      throw new Error("Decodo proxy credentials are not configured");
    }

    const sessionKey = input.sessionKey ?? randomUUID().slice(0, 12);
    const regionPart = input.region ? `_region-${input.region}` : "";
    const cityPart = input.city ? `_city-${input.city.replace(/\s+/g, "-")}` : "";
    const username = `${baseUsername}_country-${input.country}${regionPart}${cityPart}_session-${sessionKey}`;

    const leaseId = randomUUID();
    const lease: ProxyLease = {
      leaseId,
      host,
      port: Number(port),
      username,
      password,
      country: "AU",
      region: input.region,
      city: input.city,
      sessionKey,
    };

    activeLeases.set(leaseId, lease);
    return lease;
  }

  async release(leaseId: string): Promise<void> {
    activeLeases.delete(leaseId);
  }
}
