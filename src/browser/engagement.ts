import type { Page } from "playwright";
import { randomBetween, randomFloat, sleep } from "../utils/helpers.js";
import { pickInternalLink } from "./internal-links.js";

export interface EngagementResult {
  template: string;
  scrollDepth: number;
  scrollActions: number;
  internalClicks: number;
  pageviews: number;
  durationSeconds: number;
  timeToFirstScrollMs: number;
}

export interface EngagementConfig {
  initialRenderWaitMs: { min: number; max: number };
  betweenActionsMs: { min: number; max: number };
  dwellSeconds: {
    short: { min: number; max: number };
    normal: { min: number; max: number };
    long: { min: number; max: number };
  };
}

export const DEFAULT_ENGAGEMENT_CONFIG: EngagementConfig = {
  initialRenderWaitMs: { min: 1200, max: 4500 },
  betweenActionsMs: { min: 700, max: 5000 },
  dwellSeconds: {
    short: { min: 12, max: 35 },
    normal: { min: 35, max: 100 },
    long: { min: 90, max: 240 },
  },
};

/** Used for DRY_RUN smoke tests so sessions finish in seconds, not minutes. */
export const FAST_DRY_RUN_ENGAGEMENT_CONFIG: EngagementConfig = {
  initialRenderWaitMs: { min: 300, max: 800 },
  betweenActionsMs: { min: 150, max: 400 },
  dwellSeconds: {
    short: { min: 2, max: 4 },
    normal: { min: 3, max: 6 },
    long: { min: 5, max: 8 },
  },
};

const SCROLL_RANGES: Record<string, { min: number; max: number }> = {
  short_visit: { min: 10, max: 35 },
  read_only: { min: 35, max: 75 },
  internal_navigation: { min: 35, max: 75 },
  long_read: { min: 65, max: 100 },
};

async function scrollToDepth(
  page: Page,
  targetDepthPercent: number,
  config: EngagementConfig,
  onScroll?: () => void,
): Promise<{ scrollDepth: number; scrollActions: number; timeToFirstScrollMs: number }> {
  const startedAt = Date.now();
  let timeToFirstScrollMs = 0;
  let scrollActions = 0;
  let maxDepth = 0;

  const docHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewport = page.viewportSize()?.height ?? 768;
  const maxScroll = Math.max(docHeight - viewport, 1);
  const targetPx = (targetDepthPercent / 100) * maxScroll;

  let current = 0;
  while (current < targetPx) {
    if (scrollActions === 0) {
      timeToFirstScrollMs = Date.now() - startedAt;
      onScroll?.();
    }
    const step = randomBetween(120, 420);
    await page.mouse.wheel(0, step);
    current += step;
    scrollActions += 1;
    maxDepth = Math.min(100, (current / maxScroll) * 100);
    await sleep(randomBetween(config.betweenActionsMs.min, config.betweenActionsMs.max));
    if (scrollActions > 30) break;
  }

  return { scrollDepth: maxDepth, scrollActions, timeToFirstScrollMs };
}

export async function runEngagement(
  page: Page,
  template: string,
  config: EngagementConfig = DEFAULT_ENGAGEMENT_CONFIG,
  onScroll?: () => void,
  onInternalClick?: () => void,
): Promise<EngagementResult> {
  const startedAt = Date.now();
  await sleep(randomBetween(config.initialRenderWaitMs.min, config.initialRenderWaitMs.max));

  const range = SCROLL_RANGES[template] ?? SCROLL_RANGES.read_only!;
  const targetDepth = randomFloat(range.min, range.max);

  let dwellBand = config.dwellSeconds.normal;
  if (template === "short_visit") dwellBand = config.dwellSeconds.short;
  if (template === "long_read") dwellBand = config.dwellSeconds.long;

  const scroll = await scrollToDepth(page, targetDepth, config, onScroll);
  let internalClicks = 0;
  let pageviews = 1;

  if (template === "internal_navigation") {
    const href = await pickInternalLink(page);
    if (href) {
      await page.locator(`a[href="${href}"]`).first().click().catch(async () => {
        await page.goto(href, { waitUntil: "domcontentloaded" });
      });
      internalClicks = 1;
      pageviews = 2;
      onInternalClick?.();
      await sleep(randomBetween(config.betweenActionsMs.min, config.betweenActionsMs.max));
      await scrollToDepth(page, randomFloat(20, 60), config, onScroll);
    }
  }

  const targetDwellMs = randomBetween(dwellBand.min, dwellBand.max) * 1000;
  const elapsed = Date.now() - startedAt;
  if (elapsed < targetDwellMs) {
    await sleep(targetDwellMs - elapsed);
  }

  return {
    template,
    scrollDepth: scroll.scrollDepth,
    scrollActions: scroll.scrollActions,
    internalClicks,
    pageviews,
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    timeToFirstScrollMs: scroll.timeToFirstScrollMs,
  };
}
