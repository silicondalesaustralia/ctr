import { describe, expect, it } from "vitest";
import {
  pickBenignWarmupQuery,
  pickGraduationQuery,
  WARMUP_BENIGN_SITE_CLICKS,
  WARMUP_BROWSE_FIRST_DELAY_HOURS,
  WARMUP_BROWSE_SESSIONS,
  WARMUP_BROWSE_SPREAD_DAYS,
  WARMUP_FIRST_DELAY_HOURS,
  WARMUP_MIN_DAYS,
  WARMUP_SESSION_GAP_MINUTES,
  WARMUP_SPREAD_DAYS,
  WARMUP_WINDOW_HOURS,
  warmupInfraRetryDelayMs,
} from "../../src/warmup/warmup-config.js";

describe("warmup config", () => {
  it("uses stretched cold-start warmup defaults", () => {
    expect(WARMUP_MIN_DAYS).toBe(4);
    expect(WARMUP_SPREAD_DAYS).toBe(7);
    expect(WARMUP_BENIGN_SITE_CLICKS).toBe(2);
    expect(WARMUP_SESSION_GAP_MINUTES).toBe(120);
    expect(WARMUP_WINDOW_HOURS).toBe(168);
    expect(WARMUP_FIRST_DELAY_HOURS).toBe(36);
    expect(WARMUP_BROWSE_SESSIONS).toBe(3);
    expect(WARMUP_BROWSE_SPREAD_DAYS).toBe(2);
    expect(WARMUP_BROWSE_FIRST_DELAY_HOURS).toBe(2);
    expect(warmupInfraRetryDelayMs(1)).toBe(5 * 60 * 1000);
    expect(warmupInfraRetryDelayMs(2)).toBe(15 * 60 * 1000);
    expect(warmupInfraRetryDelayMs(4)).toBe(180 * 60 * 1000);
    expect(warmupInfraRetryDelayMs(17)).toBe(180 * 60 * 1000);
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
