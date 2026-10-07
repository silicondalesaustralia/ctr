import { describe, expect, it } from "vitest";
import { buildBrightDataUsername } from "../../src/providers/proxy/brightdata-utils.js";
import { classifyAuConnection, inMobileRange } from "../../src/providers/proxy/mobile-classify.js";

describe("mobile-classify", () => {
  it("treats Telstra's mobile ranges as mobile", () => {
    expect(inMobileRange("1.141.169.4")).toBe(true);
    expect(inMobileRange("1.160.0.1")).toBe(false);
    expect(inMobileRange("2001:8004:1234::1")).toBe(true);
    expect(inMobileRange("2001:8003:b400::1")).toBe(false);
  });

  it("separates mobile, possible mobile, fixed and datacenter", () => {
    expect(classifyAuConnection({ ip: "1.140.148.169", asn: "AS1221", org: "Telstra", rdns: null })).toBe("mobile");
    expect(classifyAuConnection({ ip: "49.1.1.1", asn: "AS133612", org: "Vodafone", rdns: null })).toBe("mobile");
    expect(classifyAuConnection({ ip: "122.105.200.126", asn: "AS4804", org: "Optus", rdns: null })).toBe(
      "possible_mobile",
    );
    expect(
      classifyAuConnection({ ip: "101.190.8.39", asn: "AS1221", org: "Telstra", rdns: "x.asp.telstra.net" }),
    ).toBe("fixed");
    expect(classifyAuConnection({ ip: "149.88.101.15", asn: "AS60068", org: "Datacamp Limited", rdns: null })).toBe(
      "datacenter",
    );
  });
});

describe("brightdata-utils", () => {
  it("builds a sticky AU city + ASN username", () => {
    const username = buildBrightDataUsername("brd-customer-hl_1-zone-mob", {
      country: "AU",
      city: "Gold Coast",
      asn: 1221,
      sessionKey: "s-01",
    });
    expect(username).toBe("brd-customer-hl_1-zone-mob-country-au-city-goldcoast-asn-1221-session-s01");
  });
});
