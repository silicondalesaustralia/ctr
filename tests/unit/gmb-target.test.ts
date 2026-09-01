import { describe, expect, it } from "vitest";
import { parseGmbTarget } from "../../src/campaign/gmb-target.js";
import { actionsFromFlags, flagsFromActions, parseActionsJson } from "../../src/campaign/gmb-types.js";

describe("parseGmbTarget", () => {
  it("accepts bare Place IDs", () => {
    const parsed = parseGmbTarget("ChIJP3Sa8ziYEmsRUKgyFmh9AQM");
    expect(parsed.placeId).toBe("ChIJP3Sa8ziYEmsRUKgyFmh9AQM");
    expect(parsed.targetDomain).toContain("gmb:");
  });

  it("parses cid from Maps URLs", () => {
    const parsed = parseGmbTarget("https://www.google.com/maps?cid=1234567890");
    expect(parsed.cid).toBe("1234567890");
    expect(parsed.targetDomain).toBe("gmb:cid:1234567890");
  });

  it("rejects non-Google URLs", () => {
    expect(() => parseGmbTarget("https://example.com.au/shop")).toThrow(/Google Maps/);
  });
});

describe("gmb actions", () => {
  it("always includes open_listing", () => {
    expect(actionsFromFlags({ website: false, directions: true, call: false })).toEqual([
      "open_listing",
      "directions",
    ]);
  });

  it("round-trips JSON", () => {
    const flags = flagsFromActions(parseActionsJson('["open_listing","call"]'));
    expect(flags.call).toBe(true);
    expect(flags.website).toBe(false);
  });
});
