import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchJsonViaProxy: vi.fn(),
  recordBadGeoPrefix: vi.fn(),
}));

vi.mock("../../src/providers/proxy/proxy-http.js", () => ({ fetchJsonViaProxy: mocks.fetchJsonViaProxy }));
vi.mock("../../src/providers/proxy/ip-reputation.js", () => ({
  assertEgressPrefixClean: vi.fn(async () => undefined),
  ipPrefix: (ip: string) => ip.split(".").slice(0, 3).join("."),
}));
vi.mock("../../src/providers/proxy/bad-geo-prefixes.js", () => ({
  ANY_CITY: "*",
  assertGeoPrefixClean: vi.fn(async () => undefined),
  geoScope: (city?: string) => (city ? city.toLowerCase() : "*"),
  recordBadGeoPrefix: mocks.recordBadGeoPrefix,
}));
vi.mock("../../src/utils/helpers.js", () => ({ sleep: vi.fn(async () => undefined) }));

import { WrongEgressGeoError } from "../../src/browser/egress-geo.js";
import type { ProxyLease } from "../../src/providers/proxy/ProxyProvider.js";
import {
  checkLeaseBeforeLaunch,
  LeaseUnreachableError,
  recordLeaseRejection,
  UnstableLeaseError,
} from "../../src/providers/proxy/lease-check.js";

const lease: ProxyLease = {
  leaseId: "l1",
  host: "proxy.example",
  port: 1,
  username: "u",
  password: "p",
  country: "AU",
  sessionKey: "s",
  proxyType: "residential",
};

function ipApi(ip: string, countryCode: string, city: string) {
  return { status: "success", query: ip, countryCode, city };
}

function ipinfo(ip: string, country: string, city: string) {
  return { ip, country, city };
}

function answer(first: unknown, second: unknown | Error) {
  mocks.fetchJsonViaProxy.mockImplementation(async (_lease: ProxyLease, url: string) => {
    if (url.includes("ip-api.com")) return first;
    if (second instanceof Error) throw second;
    return second;
  });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null, (error: unknown) => error);
}

beforeEach(() => {
  mocks.fetchJsonViaProxy.mockReset();
  mocks.recordBadGeoPrefix.mockReset();
});

describe("checkLeaseBeforeLaunch", () => {
  it("accepts a lease both services place in Brisbane", async () => {
    answer(ipApi("179.65.161.115", "AU", "Brisbane"), ipinfo("179.65.161.115", "AU", "Brisbane"));
    await expect(checkLeaseBeforeLaunch(lease, "Brisbane")).resolves.toMatchObject({ ip: "179.65.161.115" });
  });

  it("accepts when only one service has the right metro (Telstra seen as Toowoomba)", async () => {
    answer(ipApi("58.165.196.18", "AU", "Toowoomba"), ipinfo("58.165.196.18", "AU", "Brisbane"));
    await expect(checkLeaseBeforeLaunch(lease, "Brisbane")).resolves.toMatchObject({ ip: "58.165.196.18" });
  });

  it("rejects when the services disagree on the country", async () => {
    answer(ipApi("163.52.190.6", "AU", "Brisbane"), ipinfo("163.52.190.6", "PH", "Naic"));
    const error = await rejection(checkLeaseBeforeLaunch(lease, "Brisbane"));
    expect(error).toBeInstanceOf(WrongEgressGeoError);
  });

  it("rejects a sticky lease whose IP changes between requests", async () => {
    answer(ipApi("163.52.190.6", "AU", "Brisbane"), ipinfo("163.52.190.21", "PH", "Naic"));
    const error = await rejection(checkLeaseBeforeLaunch(lease, "Brisbane"));
    expect(error).toBeInstanceOf(UnstableLeaseError);
  });

  it("rejects an Australian IP outside the requested metro", async () => {
    answer(ipApi("1.2.3.4", "AU", "Gold Coast"), ipinfo("1.2.3.4", "AU", "Gold Coast"));
    const error = await rejection(checkLeaseBeforeLaunch(lease, "Brisbane"));
    expect(error).toBeInstanceOf(WrongEgressGeoError);
  });

  it("treats a dead proxy as an unreachable lease", async () => {
    mocks.fetchJsonViaProxy.mockRejectedValue(new Error("proxy CONNECT returned 502"));
    const error = await rejection(checkLeaseBeforeLaunch(lease, "Brisbane"));
    expect(error).toBeInstanceOf(LeaseUnreachableError);
  });

  it("falls back to ip-api alone when ipinfo is unavailable", async () => {
    answer(ipApi("159.196.14.54", "AU", "Brisbane"), new Error("HTTP 429"));
    await expect(checkLeaseBeforeLaunch(lease, "Brisbane")).resolves.toMatchObject({ ip: "159.196.14.54" });
  });
});

describe("recordLeaseRejection", () => {
  it("sets a range aside for every city when it left the country", async () => {
    answer(ipApi("163.52.190.6", "AU", "Brisbane"), ipinfo("163.52.190.6", "PH", "Naic"));
    await recordLeaseRejection(await rejection(checkLeaseBeforeLaunch(lease, "Brisbane")), "Brisbane");
    expect(mocks.recordBadGeoPrefix).toHaveBeenCalledWith("163.52.190.6", "*", "wrong_geo", expect.stringContaining("PH"));
  });

  it("sets a range aside only for the missed city when it stayed in Australia", async () => {
    answer(ipApi("1.2.3.4", "AU", "Gold Coast"), ipinfo("1.2.3.4", "AU", "Gold Coast"));
    await recordLeaseRejection(await rejection(checkLeaseBeforeLaunch(lease, "Brisbane")), "Brisbane");
    expect(mocks.recordBadGeoPrefix).toHaveBeenCalledWith("1.2.3.4", "brisbane", "wrong_geo", expect.any(String));
  });

  it("records a rotating range once when both IPs share a /24", async () => {
    await recordLeaseRejection(new UnstableLeaseError("163.52.190.6", "163.52.190.21"), "Brisbane");
    expect(mocks.recordBadGeoPrefix).toHaveBeenCalledTimes(1);
  });
});
