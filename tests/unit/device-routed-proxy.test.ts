import { describe, expect, it, vi } from "vitest";
import { DeviceRoutedProxyProvider } from "../../src/providers/proxy/DeviceRoutedProxyProvider.js";
import type { ProxyAllocationRequest, ProxyLease, ProxyProvider } from "../../src/providers/proxy/ProxyProvider.js";
import { egressCityFor } from "../../src/sessions/clean-lease.js";

function fakeProvider(host: string): ProxyProvider & { release: ReturnType<typeof vi.fn> } {
  let n = 0;
  return {
    allocate: async (input: ProxyAllocationRequest): Promise<ProxyLease> => ({
      leaseId: `${host}-${(n += 1)}`,
      host,
      port: 1,
      username: "u",
      password: "p",
      country: input.country,
    }),
    release: vi.fn(async () => undefined),
  };
}

describe("device routed proxy provider", () => {
  it("sends mobile identities to the mobile pool and releases with the owner", async () => {
    const desktop = fakeProvider("desktop");
    const mobile = fakeProvider("mobile");
    const routed = new DeviceRoutedProxyProvider(desktop, mobile);

    const phone = await routed.allocate({ country: "AU", deviceClass: "mobile" });
    const pc = await routed.allocate({ country: "AU", deviceClass: "desktop" });
    const unknown = await routed.allocate({ country: "AU" });
    expect([phone.host, pc.host, unknown.host]).toEqual(["mobile", "desktop", "desktop"]);

    await routed.release(phone.leaseId);
    expect(mobile.release).toHaveBeenCalledWith(phone.leaseId);
    expect(desktop.release).not.toHaveBeenCalled();
  });

  it("checks mobile egress country-wide, desktop by city", () => {
    expect(egressCityFor("Sydney", "mobile")).toBeUndefined();
    expect(egressCityFor("Sydney", "desktop")).toBe("Sydney");
  });
});
