import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadExperimentConfig } from "../../src/config/experiments.js";
import { domainMatches } from "../../src/utils/helpers.js";

describe("experiment config", () => {
  it("loads test experiment yaml with valid weights", () => {
    const config = loadExperimentConfig(join(process.cwd(), "experiments/test-001.yml"));
    expect(config.experiment.queries).toHaveLength(6);
    const sum = config.experiment.queries.reduce(
      (total: number, q: { weight: number }) => total + q.weight,
      0,
    );
    expect(sum).toBeCloseTo(1);
  });
});

describe("mock serp fixture", () => {
  it("contains a target link for the configured domain", () => {
    const html = readFileSync(join(process.cwd(), "fixtures/mock-serp.html"), "utf8");
    expect(html).toContain("target-link");
    expect(domainMatches("https://example.com/clothing/womens/breeches", "example.com")).toBe(true);
  });
});
