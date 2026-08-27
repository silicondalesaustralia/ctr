import { describe, expect, it, vi } from "vitest";
import type { CampaignProposal } from "../../src/campaign/campaign-proposal.js";
import { rebuildProposalAfterPreflight } from "../../src/campaign/keyword-preflight.js";

vi.mock("../../src/db/client.js", () => ({
  prisma: {
    identity: {
      count: vi.fn(async () => 10),
    },
  },
}));

function baseProposal(): CampaignProposal {
  return {
    keyword: "selling food from home mount barker sa",
    targetUrl: "https://example.com/page",
    region: "SA",
    campaignDurationDays: 21,
    treatmentIntensity: "strong",
    adaptivePacing: true,
    recalculateEveryDays: 3,
    maxShareOfSearchDemand: 0.02,
    maxShareOfGscImpressions: 0.05,
    desktopPercent: 65,
    ctrSource: "default_curve",
    queries: [
      { text: "selling food from home mount barker sa", type: "core", weight: 0.35 },
      { text: "selling food from home mount barker sa online", type: "close_variation", weight: 0.2 },
      { text: "buy selling food from home mount barker sa", type: "long_tail", weight: 0.15 },
    ],
    intensity: {
      queries: [],
      totalBaselineClicks: 1.8,
      totalTreatmentSessions: 6,
      totalAllocatedSessions: 6,
      suggestedIdentities: 3,
      activeIdentityCount: 10,
      identityDeficit: null,
      feasibleSessions: 6,
      treatmentMultiplier: 2,
    },
    rationales: [],
    gscStatus: "unavailable",
    gscQueryCount: 0,
  };
}

describe("rebuildProposalAfterPreflight", () => {
  it("keeps only findable queries and recalculates sessions", async () => {
    const proposal = baseProposal();
    const updated = await rebuildProposalAfterPreflight(proposal, [
      {
        query: "selling food from home mount barker sa",
        found: false,
        serpPage: 3,
        position: null,
        globalPosition: null,
        status: "not_found",
      },
      {
        query: "selling food from home mount barker sa online",
        found: true,
        serpPage: 2,
        position: 4,
        globalPosition: 14,
        status: "found",
      },
      {
        query: "buy selling food from home mount barker sa",
        found: false,
        serpPage: 3,
        position: null,
        globalPosition: null,
        status: "not_found",
      },
    ]);

    expect(updated.queries.length).toBe(1);
    expect(updated.queries[0]?.text).toBe("selling food from home mount barker sa online");
    expect(updated.keyword).toBe("selling food from home mount barker sa online");
    expect(updated.preflight?.keywordAdjusted).toBe(true);
    expect(updated.preflight?.findableCount).toBe(1);
    expect(updated.intensity.totalAllocatedSessions).toBeGreaterThan(0);
    expect(updated.rationales.some((r) => r.setting === "Google preflight")).toBe(true);
  });

  it("returns zero sessions when nothing is findable", async () => {
    const proposal = baseProposal();
    const updated = await rebuildProposalAfterPreflight(proposal, proposal.queries.map((q) => ({
      query: q.text,
      found: false,
      serpPage: 3,
      position: null,
      globalPosition: null,
      status: "not_found" as const,
    })));

    expect(updated.queries.length).toBe(0);
    expect(updated.intensity.totalAllocatedSessions).toBe(0);
    expect(updated.preflight?.status).toBe("none_found");
  });
});
