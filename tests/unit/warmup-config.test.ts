import { describe, expect, it } from "vitest";
import {
  pickBenignWarmupQuery,
  pickGraduationQuery,
  WARMUP_BENIGN_SITE_CLICKS,
  WARMUP_MIN_DAYS,
  WARMUP_SPREAD_DAYS,
} from "../../src/warmup/warmup-config.js";

describe("warmup config", () => {
  it("uses compact warmup defaults", () => {
    expect(WARMUP_MIN_DAYS).toBe(1);
    expect(WARMUP_SPREAD_DAYS).toBe(1);
    expect(WARMUP_BENIGN_SITE_CLICKS).toBe(2);
  });

  it("fills city placeholders in graduation templates", () => {
    const queries = new Set(
      Array.from({ length: 20 }, (_, index) =>
        pickGraduationQuery(`au_${String(index).padStart(3, "0")}`, "Adelaide"),
      ),
    );
    expect(queries.size).toBeGreaterThan(5);
    expect([...queries].some((query) => query.includes("adelaide"))).toBe(true);
  });

  it("keeps benign queries non-commercial", () => {
    const query = pickBenignWarmupQuery("Brisbane", 1);
    expect(query.toLowerCase()).not.toMatch(/buy|lawyer|plumber|insurance/);
  });
});
