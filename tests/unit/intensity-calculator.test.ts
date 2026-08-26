import { describe, expect, it } from "vitest";
import { defaultCtrForPosition, buildGscSiteCurve, ctrForPosition } from "../../src/campaign/ctr-curve.js";
import {
  calculateCampaignIntensity,
  TREATMENT_MULTIPLIERS,
} from "../../src/campaign/intensity-calculator.js";

describe("defaultCtrForPosition", () => {
  it("returns higher CTR for top positions", () => {
    expect(defaultCtrForPosition(1)).toBeGreaterThan(defaultCtrForPosition(10));
    expect(defaultCtrForPosition(10)).toBeGreaterThan(defaultCtrForPosition(25));
  });
});

describe("buildGscSiteCurve", () => {
  it("derives bucket CTR from GSC snapshots", () => {
    const curve = buildGscSiteCurve([
      { position: 2, ctr: 0.2, impressions: 100 },
      { position: 8, ctr: 0.04, impressions: 200 },
    ]);

    const top = curve.find((b) => b.min === 1)!;
    expect(top.avgCtr).toBeCloseTo(0.2, 2);
    expect(top.sampleSize).toBe(1);
  });
});

describe("calculateCampaignIntensity", () => {
  it("uses GSC impressions over volume when available", () => {
    const result = calculateCampaignIntensity({
      queries: [
        {
          text: "womens breeches",
          type: "core",
          weight: 1,
          monthlySearchVolume: 20000,
          startingPosition: 24,
          gscImpressions28d: 2100,
          gscClicks28d: 8,
        },
      ],
      trafficModel: {
        campaignDurationDays: 14,
        treatmentIntensity: "normal",
        maxShareOfSearchDemand: 0.02,
        maxShareOfGscImpressions: 0.5,
        ctrSource: "default_curve",
        desktopPercent: 65,
      },
    });

    expect(result.queries[0]!.demandSource).toBe("gsc");
    expect(result.queries[0]!.expectedBaselineClicks).toBeLessThan(30);
    expect(result.totalAllocatedSessions).toBeGreaterThan(0);
    expect(result.treatmentMultiplier).toBe(TREATMENT_MULTIPLIERS.normal);
  });

  it("caps treatment by max share of search demand", () => {
    const result = calculateCampaignIntensity({
      queries: [
        {
          text: "popular term",
          type: "core",
          weight: 1,
          monthlySearchVolume: 100000,
          startingPosition: 3,
        },
      ],
      trafficModel: {
        campaignDurationDays: 14,
        treatmentIntensity: "strong",
        maxShareOfSearchDemand: 0.01,
        maxShareOfGscImpressions: 0.5,
        ctrSource: "default_curve",
        desktopPercent: 65,
      },
    });

    const marketSearches = 100000 * (14 / 30);
    const maxFromDemand = Math.floor(marketSearches * 0.01);
    expect(result.queries[0]!.cappedTreatmentSessions).toBeLessThanOrEqual(maxFromDemand);
  });

  it("allocates independently per query", () => {
    const result = calculateCampaignIntensity({
      queries: [
        {
          text: "head term",
          type: "core",
          weight: 0.5,
          monthlySearchVolume: 20000,
          startingPosition: 24,
          gscImpressions28d: 2100,
          gscClicks28d: 8,
        },
        {
          text: "mid term",
          type: "close_variation",
          weight: 0.3,
          monthlySearchVolume: 4000,
          startingPosition: 13,
        },
        {
          text: "better rank",
          type: "local",
          weight: 0.2,
          monthlySearchVolume: 1800,
          startingPosition: 8,
        },
      ],
      trafficModel: {
        campaignDurationDays: 14,
        treatmentIntensity: "normal",
        maxShareOfSearchDemand: 0.02,
        maxShareOfGscImpressions: 0.05,
        ctrSource: "default_curve",
        desktopPercent: 65,
      },
    });

    expect(result.queries).toHaveLength(3);
    const pos8 = result.queries.find((q) => q.query === "better rank")!;
    const pos24 = result.queries.find((q) => q.query === "head term")!;
    expect(pos8.allocatedSessions).toBeGreaterThan(pos24.allocatedSessions);
  });

  it("uses site curve when ctr source is gsc_site_curve", () => {
    const siteCurve = buildGscSiteCurve([
      { position: 24, ctr: 0.01, impressions: 500 },
    ]);
    const customCtr = ctrForPosition(24, siteCurve);
    expect(customCtr).toBeCloseTo(0.01, 3);
  });
});
