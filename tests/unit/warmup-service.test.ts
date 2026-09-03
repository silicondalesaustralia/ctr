import { describe, expect, it } from "vitest";
import type { Identity } from "@prisma/client";
import {
  computeWarmupProgress,
  identityAllowedForCampaign,
  isWarmupEligible,
} from "../../src/warmup/warmup-service.js";
import {
  graduationQueryPoolSize,
  pickBenignWarmupQuery,
  pickGraduationQuery,
  WARMUP_BENIGN_SITE_CLICKS,
  WARMUP_MIN_DAYS,
} from "../../src/warmup/warmup-config.js";

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
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    lastUsedAt: null,
    personaId: "persona1",
    personaAssignedAt: new Date(),
    warmupStatus: "warming",
    warmupSessionsCompleted: 0,
    warmupSiteClicks: 0,
    warmupGraduationPassed: false,
    warmupEligibleAt: null,
    ...overrides,
  };
}

describe("warmup eligibility", () => {
  it("requires site clicks and graduation pass (no min age by default)", () => {
    const fresh = makeIdentity({
      createdAt: new Date(),
      warmupSiteClicks: WARMUP_BENIGN_SITE_CLICKS,
      warmupGraduationPassed: true,
    });
    expect(isWarmupEligible(fresh)).toBe(true);

    const noGraduation = makeIdentity({
      warmupSiteClicks: WARMUP_BENIGN_SITE_CLICKS,
      warmupGraduationPassed: false,
    });
    expect(isWarmupEligible(noGraduation)).toBe(false);

    const notEnoughClicks = makeIdentity({
      warmupSiteClicks: WARMUP_BENIGN_SITE_CLICKS - 1,
      warmupGraduationPassed: true,
    });
    expect(isWarmupEligible(notEnoughClicks)).toBe(false);

    const ready = makeIdentity({
      warmupSiteClicks: WARMUP_BENIGN_SITE_CLICKS,
      warmupGraduationPassed: true,
    });
    expect(isWarmupEligible(ready)).toBe(true);
  });

  it("reports progress fields for the dashboard", () => {
    const progress = computeWarmupProgress(
      makeIdentity({ warmupSiteClicks: 2, warmupGraduationPassed: false }),
      2,
    );
    expect(progress.eligible).toBe(false);
    expect(progress.siteClicks).toBe(2);
    expect(progress.minSiteClicks).toBe(WARMUP_BENIGN_SITE_CLICKS);
    expect(progress.minDays).toBe(WARMUP_MIN_DAYS);
    expect(progress.graduationPassed).toBe(false);
    expect(progress.scheduledRemaining).toBe(2);
  });

  it("allows cold identities when campaign does not require warmup", () => {
    const cold = makeIdentity({ warmupSiteClicks: 0, warmupGraduationPassed: false });
    expect(identityAllowedForCampaign(cold, false)).toBe(true);
    expect(identityAllowedForCampaign(cold, true)).toBe(false);
  });
});

describe("identityMatchesCampaignGeo", () => {
  it("locks to city in hyper-local mode", async () => {
    const { identityMatchesCampaignGeo } = await import("../../src/warmup/warmup-service.js");
    const adelaide = makeIdentity({ city: "Adelaide", region: "SA", country: "AU" });
    const sydney = makeIdentity({ city: "Sydney", region: "NSW", country: "AU", externalId: "au_002" });
    expect(
      identityMatchesCampaignGeo(adelaide, {
        scope: "city",
        focusCity: "Adelaide",
        focusRegion: "SA",
        country: "AU",
      }),
    ).toBe(true);
    expect(
      identityMatchesCampaignGeo(sydney, {
        scope: "city",
        focusCity: "Adelaide",
        focusRegion: "SA",
        country: "AU",
      }),
    ).toBe(false);
  });

  it("allows any country identity in country-wide mode", async () => {
    const { identityMatchesCampaignGeo } = await import("../../src/warmup/warmup-service.js");
    const sydney = makeIdentity({ city: "Sydney", region: "NSW", country: "AU", externalId: "au_002" });
    expect(
      identityMatchesCampaignGeo(sydney, {
        scope: "country",
        focusCity: "Adelaide",
        focusRegion: "SA",
        country: "AU",
      }),
    ).toBe(true);
  });
});

describe("warmup query selection", () => {
  it("assigns a stable commercial graduation query per identity", () => {
    const first = pickGraduationQuery("au_010", "Perth");
    const second = pickGraduationQuery("au_010", "Perth");
    const other = pickGraduationQuery("au_014", "Perth");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first.length).toBeGreaterThan(5);
  });

  it("uses benign queries for early warmup sessions", () => {
    expect(pickBenignWarmupQuery("Sydney", 0)).toMatch(/sydney|weather|news/i);
  });

  it("has a large graduation query pool", () => {
    expect(graduationQueryPoolSize()).toBeGreaterThanOrEqual(50);
  });
});
