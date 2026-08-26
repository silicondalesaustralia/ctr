import { describe, expect, it } from "vitest";
import { parseExternalIdNumber } from "../../src/identities/identity-service.js";
import { calculateCampaignIntensity } from "../../src/campaign/intensity-calculator.js";

describe("parseExternalIdNumber", () => {
  it("parses au_ prefixed ids", () => {
    expect(parseExternalIdNumber("au_001")).toBe(1);
    expect(parseExternalIdNumber("au_042")).toBe(42);
    expect(parseExternalIdNumber("invalid")).toBeNull();
  });
});

describe("identityDeficit", () => {
  it("reports how many more identities are needed", () => {
    const result = calculateCampaignIntensity({
      queries: [
        {
          text: "test query",
          type: "core",
          weight: 1,
          monthlySearchVolume: 5000,
          startingPosition: 15,
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
      activeIdentityCount: 3,
    });

    expect(result.identityDeficit).toBe(Math.max(0, result.suggestedIdentities - 3));
    expect(result.feasibleSessions).toBeLessThanOrEqual(result.totalAllocatedSessions);
  });

  it("returns zero deficit when pool is sufficient", () => {
    const result = calculateCampaignIntensity({
      queries: [
        {
          text: "small query",
          type: "core",
          weight: 1,
          startingPosition: 30,
        },
      ],
      trafficModel: {
        campaignDurationDays: 14,
        treatmentIntensity: "low",
        maxShareOfSearchDemand: 0.02,
        maxShareOfGscImpressions: 0.05,
        ctrSource: "default_curve",
        desktopPercent: 65,
      },
      activeIdentityCount: 50,
    });

    expect(result.identityDeficit).toBe(0);
  });
});
