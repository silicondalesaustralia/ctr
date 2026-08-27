import { describe, expect, it } from "vitest";
import type { Identity } from "@prisma/client";
import {
  computeWarmupProgress,
  isWarmupEligible,
} from "../../src/warmup/warmup-service.js";

function makeIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    id: "id1",
    externalId: "au_001",
    externalProfileId: "profile1",
    profileProvider: "gologin",
    deviceClass: "mobile",
    osFamily: "android",
    browserFamily: "chromium",
    locale: "en-AU",
    timezone: "Australia/Sydney",
    country: "AU",
    region: "NSW",
    city: "Sydney",
    active: true,
    totalSessions: 0,
    googleSessions: 0,
    targetClicks: 0,
    blockedSessions: 0,
    lastQuery: null,
    lastExperimentId: null,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    lastUsedAt: null,
    personaId: "persona1",
    personaAssignedAt: new Date(),
    warmupStatus: "warming",
    warmupSessionsCompleted: 0,
    warmupSiteClicks: 0,
    warmupEligibleAt: null,
    ...overrides,
  };
}

describe("warmup eligibility", () => {
  it("requires age, sessions, and site clicks", () => {
    const fresh = makeIdentity({
      createdAt: new Date(),
      warmupSessionsCompleted: 10,
      warmupSiteClicks: 2,
    });
    expect(isWarmupEligible(fresh)).toBe(false);

    const almost = makeIdentity({
      warmupSessionsCompleted: 10,
      warmupSiteClicks: 1,
    });
    expect(isWarmupEligible(almost)).toBe(false);

    const ready = makeIdentity({
      warmupSessionsCompleted: 10,
      warmupSiteClicks: 2,
    });
    expect(isWarmupEligible(ready)).toBe(true);
  });

  it("reports progress fields for the dashboard", () => {
    const progress = computeWarmupProgress(
      makeIdentity({ warmupSessionsCompleted: 4, warmupSiteClicks: 1 }),
      6,
    );
    expect(progress.eligible).toBe(false);
    expect(progress.sessionsCompleted).toBe(4);
    expect(progress.siteClicks).toBe(1);
    expect(progress.scheduledRemaining).toBe(6);
  });
});
