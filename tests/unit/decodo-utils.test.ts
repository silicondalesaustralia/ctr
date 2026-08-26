import { describe, expect, it } from "vitest";
import { buildDecodoUsername } from "../../src/providers/proxy/decodo-utils.js";

describe("buildDecodoUsername", () => {
  it("builds a Decodo sticky AU username with city targeting", () => {
    const username = buildDecodoUsername("sp123abc", {
      country: "AU",
      city: "Melbourne",
      sessionKey: "sess001",
    });

    expect(username).toBe(
      "user-sp123abc-country-au-city-melbourne-session-sess001-sessionduration-30",
    );
  });

  it("preserves an existing user- prefix once", () => {
    const username = buildDecodoUsername("user-sp123abc", {
      country: "AU",
      city: "Sydney",
      sessionKey: "abc",
    });

    expect(username.startsWith("user-sp123abc-country-au-city-sydney-session-abc")).toBe(true);
  });
});
