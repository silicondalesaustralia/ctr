import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "./ProxyProvider.js";

/** Mobile identities lease from one provider, everyone else from another. */
export class DeviceRoutedProxyProvider implements ProxyProvider {
  private readonly owners = new Map<string, ProxyProvider>();

  constructor(
    private readonly desktop: ProxyProvider,
    private readonly mobile: ProxyProvider,
  ) {}

  async allocate(input: ProxyAllocationRequest): Promise<ProxyLease> {
    const provider = input.deviceClass === "mobile" ? this.mobile : this.desktop;
    const lease = await provider.allocate(input);
    this.owners.set(lease.leaseId, provider);
    return lease;
  }

  async release(leaseId: string): Promise<void> {
    const provider = this.owners.get(leaseId);
    this.owners.delete(leaseId);
    if (!provider) return;
    await provider.release(leaseId);
  }
}
