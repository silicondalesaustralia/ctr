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
});
