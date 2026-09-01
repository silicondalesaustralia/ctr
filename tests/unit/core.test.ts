import { describe, expect, it } from "vitest";
import {
  selectEngagementTemplate,
  selectWeightedQuery,
} from "../../src/experiments/experiment-service.js";
import {
  citeMatchesDomain,
  classifyGoogleSerpHref,
  domainMatches,
  isGoogleRedirectHref,
  isGoogleRedirectPage,
  resolveGoogleSerpHref,
} from "../../src/utils/helpers.js";
import { candidateMatchesTarget, isOrganicCandidate } from "../../src/browser/serp-parser.js";
import { scoreInternalLink } from "../../src/browser/internal-links.js";
import { shouldRetry, getRetryDelayMinutes } from "../../src/scheduler/retry-policy.js";
import {
  aggregateQueryMetrics,
  calculatePositionDelta,
  weightedClusterAverage,
} from "../../src/analytics/ranking-analysis.js";
import { buildClusterMetrics } from "../../src/analytics/cluster-analysis.js";
import { calculateDifferenceInDifferences } from "../../src/analytics/control-analysis.js";
import { checkBlockedSignals } from "../../src/browser/blocked-detection.js";

describe("selectWeightedQuery", () => {
  it("respects configured weights", () => {
    const queries = [
      { id: "1", weight: 0.9 },
      { id: "2", weight: 0.1 },
    ];
    expect(selectWeightedQuery(queries, 0.05).id).toBe("1");
    expect(selectWeightedQuery(queries, 0.95).id).toBe("2");
  });
});

describe("selectEngagementTemplate", () => {
  it("returns a configured template", () => {
    const template = selectEngagementTemplate(
      { read_only: 1, internal_navigation: 0, short_visit: 0, long_read: 0 },
      0.5,
    );
    expect(template).toBe("read_only");
  });
});

describe("domainMatches", () => {
  it("matches target domain in result URLs", () => {
    expect(domainMatches("https://www.example.com/page", "example.com")).toBe(true);
    expect(domainMatches("https://other.com/page", "example.com")).toBe(false);
  });

  it("matches domains inside Google SERP redirect links", () => {
    expect(
      domainMatches(
        "https://www.google.com/url?q=https://vendl.app/sell-food-from-home/south-australia&sa=U",
        "vendl.app",
      ),
    ).toBe(true);
  });
});

describe("Google SERP href helpers", () => {
  it("classifies classic /url and hashed /goto redirects", () => {
    expect(
      classifyGoogleSerpHref(
        "https://www.google.com/url?q=https://example.com/page&sa=U",
      ),
    ).toBe("url_redirect");
    expect(
      classifyGoogleSerpHref("https://www.google.com/goto?url=abc123hashedvalue"),
    ).toBe("goto_redirect");
    expect(classifyGoogleSerpHref("https://www.example.com/page")).toBe("direct");
    expect(isGoogleRedirectHref("https://www.google.com/goto?url=abc123")).toBe(true);
    expect(isGoogleRedirectHref("https://www.example.com/page")).toBe(false);
  });

  it("unwraps /url destinations but leaves /goto hashes alone", () => {
    expect(
      resolveGoogleSerpHref(
        "https://www.google.com/url?q=https://example.com/breeches&sa=U",
      ),
    ).toBe("https://example.com/breeches");
    expect(
      resolveGoogleSerpHref("https://www.google.com/goto?url=abc123hashedvalue"),
    ).toBe("https://www.google.com/goto?url=abc123hashedvalue");
  });

  it("matches targets from cite text when href is a hashed goto wrapper", () => {
    expect(citeMatchesDomain("www.theequestrian.com.au › clothing", "theequestrian.com.au")).toBe(
      true,
    );
    expect(citeMatchesDomain("www.other.com.au › shoes", "theequestrian.com.au")).toBe(false);
    expect(
      candidateMatchesTarget(
        {
          href: "https://www.google.com/goto?url=abc123hashedvalue",
          title: "Womens Breeches",
          displayedUrl: "www.theequestrian.com.au › clothing › breeches",
        },
        "theequestrian.com.au",
      ),
    ).toBe(true);
    expect(
      candidateMatchesTarget(
        {
          href: "https://www.google.com/goto?url=abc123hashedvalue",
          title: "Womens Breeches",
          displayedUrl: "",
        },
        "theequestrian.com.au",
      ),
    ).toBe(false);
  });

  it("treats goto links with cites as organic", () => {
    expect(
      isOrganicCandidate({
        href: "https://www.google.com/goto?url=abc123hashedvalue",
        title: "Plumber near me",
        displayedUrl: "www.hipages.com.au",
      }),
    ).toBe(true);
  });

  it("detects Google redirect landing pages", () => {
    expect(isGoogleRedirectPage("https://www.google.com/goto?url=abc")).toBe(true);
    expect(isGoogleRedirectPage("https://www.google.com.au/url?q=https://example.com")).toBe(true);
    expect(isGoogleRedirectPage("https://www.example.com/landing")).toBe(false);
  });
});

describe("internal link classifier", () => {
  it("prefers same-domain main content links", () => {
    const good = scoreInternalLink(
      "https://example.com/guide",
      "Helpful guide",
      "https://example.com/start",
      { visible: true, inMain: true, inNav: false, inFooter: false },
    );
    const bad = scoreInternalLink(
      "https://example.com/login",
      "Login",
      "https://example.com/start",
      { visible: true, inMain: false, inNav: false, inFooter: false },
    );
    expect(good).toBeGreaterThan(bad);
  });
});

describe("retry policy", () => {
  it("does not retry blocked sessions", () => {
    expect(shouldRetry("blocked", 0)).toBe(false);
    expect(getRetryDelayMinutes("blocked")).toBe(0);
  });

  it("retries proxy errors under until-success policy", () => {
    expect(shouldRetry("proxy_error", 0)).toBe(true);
    expect(shouldRetry("proxy_error", 2)).toBe(true);
    expect(shouldRetry("proxy_error", 10_000)).toBe(false);
  });
});

describe("ranking analysis", () => {
  it("calculates positive position delta as improvement", () => {
    expect(calculatePositionDelta(12.4, 8.7)).toBeCloseTo(3.7);
  });

  it("aggregates baseline and treatment windows", () => {
    const baselineEnd = new Date("2026-01-28");
    const treatmentEnd = new Date("2026-02-28");
    const metrics = aggregateQueryMetrics(
      [
        {
          query: "sell eggs from home",
          date: new Date("2026-01-10"),
          position: 12,
          impressions: 100,
          ctr: 0.02,
        },
        {
          query: "sell eggs from home",
          date: new Date("2026-02-10"),
          position: 8,
          impressions: 140,
          ctr: 0.03,
        },
      ],
      baselineEnd,
      treatmentEnd,
    );
    expect(metrics[0]?.positionDelta).toBeGreaterThan(0);
  });

  it("computes weighted cluster average", () => {
    const avg = weightedClusterAverage(
      [
        {
          query: "a",
          baselinePosition: 10,
          treatmentPosition: 8,
          postTreatmentPosition: 9,
          baselineImpressions: 1,
          treatmentImpressions: 1,
          postTreatmentImpressions: 1,
          baselineCtr: 0.1,
          treatmentCtr: 0.1,
          postTreatmentCtr: 0.1,
          positionDelta: 2,
        },
      ],
      { a: 1 },
    );
    expect(avg).toBe(8);
  });
});

describe("cluster analysis", () => {
  it("tracks untreated query movement separately", () => {
    const metrics = [
      {
        query: "treated",
        baselinePosition: 12,
        treatmentPosition: 8,
        postTreatmentPosition: 8,
        baselineImpressions: 10,
        treatmentImpressions: 20,
        postTreatmentImpressions: 20,
        baselineCtr: 0.1,
        treatmentCtr: 0.1,
        postTreatmentCtr: 0.1,
        positionDelta: 4,
      },
      {
        query: "untreated",
        baselinePosition: 15,
        treatmentPosition: 13,
        postTreatmentPosition: 13,
        baselineImpressions: 5,
        treatmentImpressions: 6,
        postTreatmentImpressions: 6,
        baselineCtr: 0.05,
        treatmentCtr: 0.05,
        postTreatmentCtr: 0.05,
        positionDelta: 2,
      },
    ];
    const result = buildClusterMetrics(metrics, ["treated"], ["untreated"]);
    expect(result.untreatedMovement).toBe(2);
    expect(result.treated.top10QueryCount).toBe(1);
  });
});

describe("control analysis", () => {
  it("computes difference-in-differences", () => {
    const result = calculateDifferenceInDifferences({
      targetBaseline: 14,
      targetTreatment: 9.5,
      controlBaseline: 13.5,
      controlTreatment: 12.8,
    });
    expect(result.estimatedTreatmentDifference).toBeCloseTo(3.8);
  });
});

describe("blocked detection", () => {
  it("detects CAPTCHA pages and stops", () => {
    const result = checkBlockedSignals(
      "https://www.google.com/sorry/index",
      "Please complete the CAPTCHA to continue",
    );
    expect(result.blocked).toBe(true);
  });

  it("does not treat Google consent interstitials as blocked", () => {
    const result = checkBlockedSignals(
      "https://consent.google.com/m",
      "Before you continue to Google",
    );
    expect(result.blocked).toBe(false);
  });
});

describe("monthly schedule totals", () => {
  it("distributes the configured monthly total", () => {
    const total = 301;
    const days = 30;
    const base = Math.floor(total / days);
    let remainder = total - base * days;
    const daily = Array.from({ length: days }, () => base);
    let index = 0;
    while (remainder > 0) {
      const slot = daily[index % days];
      if (slot !== undefined) daily[index % days] = slot + 1;
      remainder -= 1;
      index += 1;
    }
    expect(daily.reduce((sum, n) => sum + n, 0)).toBe(301);
    expect(Math.max(...daily)).toBeGreaterThan(Math.min(...daily));
  });
});
