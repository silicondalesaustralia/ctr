import { describe, expect, it } from "vitest";
import { buildSoaxUsername } from "../../src/providers/proxy/soax-utils.js";

describe("soax-utils", () => {
  it("builds a sticky mobile AU city + ASN rules username", () => {
    const username = buildSoaxUsername("mob", { country: "AU", city: "Gold Coast", asn: 1221, sessionKey: "s-01" });
    expect(username).toBe("network-mob-country-au-city-gold_coast-asn-1221-session-s01-rotate-timed_30m");
  });

  it("adds carrier targeting by ISP code", () => {
    expect(buildSoaxUsername("mob", { country: "AU", city: "Adelaide", isp: "telstra_internet", sessionKey: "a1" })).toBe(
      "network-mob-country-au-city-adelaide-isp-telstra_internet-session-a1-rotate-timed_30m",
    );
  });

  it("omits city and ASN when not requested", () => {
    expect(buildSoaxUsername("res", { country: "AU", sessionKey: "x1" }, 10)).toBe(
      "network-res-country-au-session-x1-rotate-timed_10m",
    );
  });

  it("caps session ids at 32 chars while keeping retries distinct", () => {
    const id = "cmuph3pef0002pk0si9xr74qpcmuph3pef00";
    const keys = ["", "r2"].map((s) => buildSoaxUsername("mob", { country: "AU", sessionKey: `${id}${s}` }));
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(key).toMatch(/-session-[a-z0-9]{32}-rotate/);
  });
});
