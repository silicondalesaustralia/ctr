import { describe, expect, it } from "vitest";
import { auCarrierFor, normalizeAsn } from "../../src/providers/proxy/carrier-asn.js";
import { buildOxylabsUsername, toOxylabsCitySlug } from "../../src/providers/proxy/oxylabs-utils.js";

describe("oxylabs-utils", () => {
  it("builds a sticky AU city username with the customer- prefix", () => {
    const username = buildOxylabsUsername("mobile_abc", { country: "au", city: "Adelaide", sessionKey: "s-001" });
    expect(username).toBe("customer-mobile_abc-cc-AU-city-adelaide-sessid-s001-sesstime-30");
  });

  it("does not double the customer- prefix and omits city when absent", () => {
    const username = buildOxylabsUsername("customer-mobile_abc", { country: "AU", sessionKey: "x1" }, 10);
    expect(username).toBe("customer-mobile_abc-cc-AU-sessid-x1-sesstime-10");
  });

  it("uses underscores for multi-word cities", () => {
    expect(toOxylabsCitySlug("Gold Coast")).toBe("gold_coast");
  });

  it("gives each lease retry of a long session id its own sticky session", () => {
    const sessionId = "cmuph3pef0002pk0si9xr74qp";
    const keys = ["", "r2", "r3"].map((suffix) =>
      buildOxylabsUsername("u", { country: "AU", sessionKey: `${sessionId}${suffix}` }),
    );
    expect(new Set(keys).size).toBe(3);
    for (const key of keys) expect(key).toMatch(/-sessid-[a-z0-9]{24}-sesstime-30$/);
  });
});

describe("carrier-asn", () => {
  it("recognises AU carrier ASNs in either format", () => {
    expect(auCarrierFor("AS1221")).toBe("Telstra");
    expect(auCarrierFor(4804)).toBe("Optus");
    expect(auCarrierFor("AS4764")).toBeNull();
    expect(normalizeAsn("")).toBeNull();
  });
});
