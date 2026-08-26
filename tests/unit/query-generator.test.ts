import { describe, expect, it } from "vitest";
import {
  buildExperimentName,
  extractTargetDomain,
  generateQueryCluster,
  resolveRegionTimezone,
} from "../../src/experiments/query-generator.js";

describe("query-generator", () => {
  it("generates weighted query cluster from keyword", () => {
    const queries = generateQueryCluster("womens breeches", "ALL");
    expect(queries.some((query) => query.text === "womens breeches" && query.type === "core")).toBe(
      true,
    );
    expect(queries.some((query) => query.text.includes("australia"))).toBe(true);
    const total = queries.reduce((sum, query) => sum + query.weight, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it("adds region-specific local query", () => {
    const queries = generateQueryCluster("womens breeches", "SA");
    expect(queries.some((query) => query.text.includes("south australia"))).toBe(true);
  });

  it("extracts target domain from url", () => {
    expect(extractTargetDomain("https://www.theequestrian.com.au/page")).toBe(
      "theequestrian.com.au",
    );
  });

  it("resolves region timezone", () => {
    expect(resolveRegionTimezone("QLD")).toBe("Australia/Brisbane");
    expect(resolveRegionTimezone("ALL")).toBe("Australia/Adelaide");
  });

  it("builds experiment name", () => {
    expect(buildExperimentName("womens breeches", "QLD")).toBe("Womens Breeches (QLD)");
  });
});
