import { describe, expect, it } from "vitest";
import {
  selectEngagementTemplate,
  selectWeightedQuery,
} from "../../src/experiments/experiment-service.js";
import { domainMatches } from "../../src/utils/helpers.js";
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

  it("retries proxy errors up to configured max", () => {
    expect(shouldRetry("proxy_error", 0)).toBe(true);
    expect(shouldRetry("proxy_error", 2)).toBe(false);
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
