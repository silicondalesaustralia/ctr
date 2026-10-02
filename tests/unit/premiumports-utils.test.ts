import { describe, expect, it } from "vitest";
import {
  buildPremiumPortsUsername,
  shouldSkipCityTargeting,
  toPremiumPortsCitySlug,
} from "../../src/providers/proxy/premiumports-utils.js";

describe("premiumports-utils", () => {
  it("builds sticky AU username with city targeting", () => {
    const username = buildPremiumPortsUsername("u_mirfyuibzz", {
      country: "AU",
      city: "Sydney",
      sessionKey: "sess001",
    });

    expect(username).toBe(
      "u_mirfyuibzz-country-au-city-sydney-session-sess001-ttl-30",
    );
  });

  it("omits city for Darwin (no inventory)", () => {
    const username = buildPremiumPortsUsername("u_mirfyuibzz", {
      country: "AU",
      city: "Darwin",
      sessionKey: "nt01",
    });

    expect(username).toBe("u_mirfyuibzz-country-au-session-nt01-ttl-30");
    expect(shouldSkipCityTargeting("Darwin")).toBe(true);
  });

  it("omits city for Bradford (pool geolocates outside West Yorkshire)", () => {
    const username = buildPremiumPortsUsername("u", { country: "GB", city: "Bradford", sessionKey: "b01" });
    expect(username).toBe("u-country-gb-session-b01-ttl-30");
  });

  it("strips hyphens from session keys so dash params stay parseable", () => {
    const username = buildPremiumPortsUsername("u_mirfyuibzz", {
      country: "AU",
      city: "Adelaide",
      sessionKey: "abc-def-001",
    });

    expect(username).toBe(
      "u_mirfyuibzz-country-au-city-adelaide-session-abcdef001-ttl-30",
    );
  });

  it("gives each lease retry of a long session id its own sticky session", () => {
    const sessionId = "cmuph3pef0002pk0si9xr74qp";
    const keys = ["", "r2", "r3"].map((suffix) =>
      buildPremiumPortsUsername("u", { country: "AU", city: "Brisbane", sessionKey: `${sessionId}${suffix}` }),
    );

    expect(new Set(keys).size).toBe(3);
    for (const key of keys) expect(key).toMatch(/-session-[a-z0-9]{24}-ttl-30$/);
  });
});
