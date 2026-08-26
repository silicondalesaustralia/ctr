import { randomUUID } from "node:crypto";
import type {
  ProxyAllocationRequest,
  ProxyLease,
  ProxyProvider,
} from "./ProxyProvider.js";

const activeLeases = new Map<string, ProxyLease>();

export class MockProxyProvider implements ProxyProvider {
  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const leaseId = randomUUID();
    const lease: ProxyLease = {
      leaseId,
      host: "127.0.0.1",
      port: 0,
      username: "mock",
      password: "mock",
      country: "AU",
      region: input.region,
      city: input.city,
      sessionKey: input.sessionKey ?? leaseId,
    };
    activeLeases.set(leaseId, lease);
    return lease;
  }

  async release(leaseId: string): Promise<void> {
    activeLeases.delete(leaseId);
  }
}
