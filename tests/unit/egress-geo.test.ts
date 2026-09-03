import { describe, expect, it } from "vitest";
import {
  assertExpectedCountry,
  parseEgressGeoPayload,
  WrongEgressGeoError,
} from "../../src/browser/egress-geo.js";
import {
  classifyBrowserErrorCode,
  isWrongEgressGeoError,
  shouldRetry,
} from "../../src/scheduler/retry-policy.js";

describe("egress geo parsing", () => {
  it("parses ipapi.co style payloads", () => {
    expect(
      parseEgressGeoPayload(
        {
          ip: "1.2.3.4",
          country_code: "au",
          region: "Victoria",
          city: "Melbourne",
        },
        "https://ipapi.co/json/",
      ),
    ).toEqual({
      ip: "1.2.3.4",
      country: "AU",
      region: "Victoria",
      city: "Melbourne",
      source: "https://ipapi.co/json/",
    });
  });

  it("parses ipinfo.io style payloads", () => {
    expect(
      parseEgressGeoPayload(
        {
          ip: "5.6.7.8",
          country: "SG",
          city: "Singapore",
          region: "Singapore",
        },
        "https://ipinfo.io/json",
      ),
    ).toMatchObject({
      ip: "5.6.7.8",
      country: "SG",
      city: "Singapore",
    });
  });

  it("rejects incomplete lookup payloads", () => {
    expect(() => parseEgressGeoPayload({ ip: "1.2.3.4" }, "test")).toThrow(
      /incomplete data/,
    );
  });

  it("throws WrongEgressGeoError for non-AU exits", () => {
    expect(() =>
      assertExpectedCountry(
        {
          ip: "1.2.3.4",
          country: "SG",
          city: "Singapore",
          source: "test",
        },
        "AU",
      ),
    ).toThrow(WrongEgressGeoError);
  });
});

describe("wrong egress geo retry classification", () => {
  it("classifies geo mismatch as retryable proxy_error", () => {
    const message =
      "Proxy egress geo mismatch: expected AU, got SG (Singapore) ip=1.2.3.4";
    expect(isWrongEgressGeoError(message)).toBe(true);
    expect(classifyBrowserErrorCode(message)).toBe("proxy_error");
    expect(shouldRetry("proxy_error", 0)).toBe(true);
  });

  it("classifies opaque fetch failed as retryable proxy_error", () => {
    expect(classifyBrowserErrorCode("fetch failed")).toBe("proxy_error");
    expect(
      classifyBrowserErrorCode("Proxy egress geo lookup failed: geo fetch failed (https://ipinfo.io/json): fetch failed"),
    ).toBe("proxy_error");
  });
});
