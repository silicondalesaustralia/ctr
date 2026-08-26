import { randomUUID } from "node:crypto";
import type { DeviceClass } from "@prisma/client";
import { getEnv } from "../../config/env.js";
import { buildDecodoUsername, type DecodoEndpoint } from "./decodo-utils.js";
import type {
  ProxyAllocationRequest,
  ProxyLease,
  ProxyProvider,
} from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

function resolveDecodoEndpoint(deviceClass?: DeviceClass): DecodoEndpoint {
  const env = getEnv();
  const useMobile = deviceClass === "mobile";

  const host = useMobile
    ? (env.DECODO_MOBILE_PROXY_HOST ?? env.DECODO_PROXY_HOST)
    : (env.DECODO_RESIDENTIAL_PROXY_HOST ?? env.DECODO_PROXY_HOST);
  const port = useMobile
    ? (env.DECODO_MOBILE_PROXY_PORT ?? env.DECODO_PROXY_PORT)
    : (env.DECODO_RESIDENTIAL_PROXY_PORT ?? env.DECODO_PROXY_PORT);
  const baseUsername = useMobile
    ? (env.DECODO_MOBILE_PROXY_USERNAME ?? env.DECODO_PROXY_USERNAME)
    : (env.DECODO_RESIDENTIAL_PROXY_USERNAME ?? env.DECODO_PROXY_USERNAME);
  const password = useMobile
    ? (env.DECODO_MOBILE_PROXY_PASSWORD ?? env.DECODO_PROXY_PASSWORD)
    : (env.DECODO_RESIDENTIAL_PROXY_PASSWORD ?? env.DECODO_PROXY_PASSWORD);

  if (!host || !port || !baseUsername || !password) {
    const label = useMobile ? "mobile" : "residential";
    throw new Error(`Decodo ${label} proxy credentials are not configured`);
  }

  return {
    host,
    port: Number(port),
    baseUsername,
    password,
  };
}

export class DecodoProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const endpoint = resolveDecodoEndpoint(input.deviceClass);
    const sessionKey = input.sessionKey ?? randomUUID().slice(0, 12);
    const username = buildDecodoUsername(endpoint.baseUsername, {
      ...input,
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

export { buildDecodoUsername, resolveDecodoEndpoint };
