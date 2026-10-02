import { describe, expect, it } from "vitest";
import { cityGeoPoint, encodeXGeo, preflightGeoPoint } from "../../src/browser/google-geo-header.js";

describe("google-geo-header", () => {
  it("encodes the device-location header the way Google's apps do", () => {
    const header = encodeXGeo({ latitude: -34.9285, longitude: 138.6007 });
    expect(header.startsWith("a ")).toBe(true);
    const decoded = Buffer.from(header.slice(2), "base64").toString("utf8");
    expect(decoded).toBe(
      "role: CURRENT_LOCATION\nproducer: DEVICE_LOCATION\nradius: 65000\nlatlng <\n" +
        "  latitude_e7: -349285000\n  longitude_e7: 1386007000\n>",
    );
  });

  it("gives each identity a stable home point near its city", () => {
    const a = cityGeoPoint("Adelaide", "profile-a");
    expect(a).toEqual(cityGeoPoint("adelaide", "profile-a"));
    expect(a).not.toEqual(cityGeoPoint("Adelaide", "profile-b"));
    expect(Math.abs(a!.latitude + 34.9285)).toBeLessThan(0.1);
    expect(cityGeoPoint("Atlantis", "x")).toBeUndefined();
    expect(cityGeoPoint(null, "x")).toBeUndefined();
  });

  it("pins validation to the campaign city, region capital, or Adelaide", () => {
    expect(preflightGeoPoint("WA", "Perth").latitude).toBeCloseTo(-31.9523);
    expect(preflightGeoPoint("QLD").latitude).toBeCloseTo(-27.4698);
    expect(preflightGeoPoint("ALL").latitude).toBeCloseTo(-34.9285);
  });
});
