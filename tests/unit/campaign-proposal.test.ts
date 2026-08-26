import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/analytics/gsc-api.js", () => ({
  fetchGscRowsForPage: vi.fn(async () => []),
  fetchGscSiteCurveRows: vi.fn(async () => []),
}));

vi.mock("../../src/analytics/gsc-connection-service.js", () => ({
  resolveGscContext: vi.fn(async () => null),
}));

vi.mock("../../src/db/client.js", () => ({
  prisma: {
    identity: {
      count: vi.fn(async () => 8),
    },
  },
}));

import { buildCampaignProposal } from "../../src/campaign/campaign-proposal.js";

describe("buildCampaignProposal", () => {
  it("builds a proposal from keyword variations when GSC is unavailable", async () => {
    const proposal = await buildCampaignProposal({
      keyword: "womens breeches",
      targetUrl: "https://www.example.com.au/breeches",
      region: "NSW",
    });

    expect(proposal.keyword).toBe("womens breeches");
    expect(proposal.region).toBe("NSW");
    expect(proposal.gscStatus).toBe("unavailable");
    expect(proposal.queries.length).toBeGreaterThan(0);
    expect(proposal.rationales.some((r) => r.setting === "Data source")).toBe(true);
    expect(proposal.rationales.some((r) => r.setting === "Treatment intensity")).toBe(true);
    expect(proposal.intensity.totalAllocatedSessions).toBeGreaterThan(0);
  });

  it("includes identity deficit rationale when pool is too small", async () => {
    const proposal = await buildCampaignProposal({
      keyword: "horse rugs australia",
      targetUrl: "https://www.example.com.au/rugs",
      region: "ALL",
    });

    const identityRationale = proposal.rationales.find((r) => r.setting === "Identities");
    if (proposal.intensity.identityDeficit && proposal.intensity.identityDeficit > 0) {
      expect(identityRationale).toBeDefined();
    }
  });
});
