import type { Page } from "playwright";
import {
  DEFAULT_ENGAGEMENT_CONFIG,
  FAST_DRY_RUN_ENGAGEMENT_CONFIG,
  scrollPageToDepth,
  type EngagementConfig,
} from "../browser/engagement.js";
import { pickInternalLink } from "../browser/internal-links.js";
import { isDryRun } from "../config/env.js";
import { randomBetween, randomFloat, sleep } from "../utils/helpers.js";
import { pickBranch, normalizeWeights } from "./action-tree.js";
import {
  effectiveDwellMs,
  effectiveInternalClickProbability,
  effectiveMaxInternalPages,
  effectivePauseMs,
  isProbabilisticBehaviourEnabled,
} from "./behaviour-config.js";
import { inspectSerp } from "./serp-inspection.js";
import { FAST_DRY_RUN_PERSONA } from "./personas.js";
import type {
  BehaviourEventCallback,
  PageDepth,
  Persona,
  SessionTraits,
  SiteJourneyBranch,
  SiteJourneyResult,
} from "./types.js";

const PAGE_DEPTH_SCROLL: Record<PageDepth, [number, number]> = {
  shallow: [10, 35],
  medium: [35, 75],
  deep: [65, 100],
};

export interface SiteJourneyInput {
  page: Page;
  persona: Persona;
  traits: SessionTraits;
  onEvent: BehaviourEventCallback;
}

function engagementConfigForRun(): EngagementConfig {
  return isDryRun() ? FAST_DRY_RUN_ENGAGEMENT_CONFIG : DEFAULT_ENGAGEMENT_CONFIG;
}

function pickSiteBranch(
  persona: Persona,
  traits: SessionTraits,
  probabilistic: boolean,
): SiteJourneyBranch {
  if (!probabilistic) {
    return "normal_read";
  }

  const weights = normalizeWeights({
    short_read: 0.15 * (2 - traits.attentionLevel),
    normal_read: 0.35,
    internal_one: 0.3 * traits.curiosity,
    back_to_serp: persona.backToSerpProbability * (2 - traits.searchConfidence),
    internal_multi: 0.1 * traits.curiosity * traits.navigationDepth,
  });

  return pickBranch(weights);
}

async function dwellForPersona(
  persona: Persona,
  traits: SessionTraits,
  multiplier = 1,
): Promise<void> {
  const range = effectiveDwellMs(persona, traits);
  const dwellMs = randomBetween(range[0], range[1]) * multiplier;
  await sleep(dwellMs);
}

async function scrollForPersona(
  page: Page,
  persona: Persona,
  traits: SessionTraits,
  config: EngagementConfig,
  onEvent: BehaviourEventCallback,
  depthMultiplier = 1,
): Promise<number> {
  const scrollRange = PAGE_DEPTH_SCROLL[persona.pageDepth];
  const targetDepth = randomFloat(scrollRange[0], scrollRange[1]) * traits.attentionLevel * depthMultiplier;
  const scroll = await scrollPageToDepth(page, Math.min(100, targetDepth), config, async () => {
    await onEvent("scroll");
  });
  return scroll.scrollDepth;
}

async function clickInternalLink(
  page: Page,
  config: EngagementConfig,
  traits: SessionTraits,
  onEvent: BehaviourEventCallback,
): Promise<boolean> {
  const href = await pickInternalLink(page);
  if (!href) {
    return false;
  }

  await page
    .locator(`a[href="${href}"]`)
    .first()
    .click()
    .catch(async () => {
      await page.goto(href, { waitUntil: "domcontentloaded" });
    });

  await onEvent("internal_click", { url: href });
  const pause = effectivePauseMs([700, 5000], traits);
  await sleep(randomBetween(pause[0], pause[1]));
  return true;
}

export async function runSiteJourney(input: SiteJourneyInput): Promise<SiteJourneyResult> {
  const persona = isDryRun() ? FAST_DRY_RUN_PERSONA : input.persona;
  const { page, traits, onEvent } = input;
  const config = engagementConfigForRun();
  const probabilistic = isProbabilisticBehaviourEnabled();
  const startedAt = Date.now();

  const initialPause = effectivePauseMs([1200, 4500], traits);
  await sleep(randomBetween(initialPause[0], initialPause[1]));

  const branch = pickSiteBranch(persona, traits, probabilistic);
  let pageviews = 1;
  let internalClicks = 0;
  let backToSerp = false;
  let maxScrollDepth = 0;

  maxScrollDepth = Math.max(
    maxScrollDepth,
    await scrollForPersona(page, persona, traits, config, onEvent),
  );

  const maxInternalPages = effectiveMaxInternalPages(persona, traits);

  if (branch === "short_read") {
    await dwellForPersona(persona, traits, 0.6);
  } else if (branch === "normal_read") {
    await dwellForPersona(persona, traits, 1);
  } else if (branch === "internal_one") {
    if (
      !probabilistic ||
      Math.random() < effectiveInternalClickProbability(persona, traits)
    ) {
      if (await clickInternalLink(page, config, traits, onEvent)) {
        internalClicks += 1;
        pageviews += 1;
        maxScrollDepth = Math.max(
          maxScrollDepth,
          await scrollForPersona(page, persona, traits, config, onEvent, 0.7),
        );
      }
    }
    await dwellForPersona(persona, traits, 0.9);
  } else if (branch === "back_to_serp") {
    await dwellForPersona(persona, traits, 0.5);
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    backToSerp = true;
    await onEvent("back_to_serp");
    await inspectSerp(page, persona, traits, onEvent);
    await sleep(randomBetween(2000, 6000) / traits.pace);
  } else if (branch === "internal_multi") {
    const targetPages = Math.max(1, Math.min(maxInternalPages, 3));
    for (let i = 0; i < targetPages; i += 1) {
      if (!(await clickInternalLink(page, config, traits, onEvent))) {
        break;
      }
      internalClicks += 1;
      pageviews += 1;
      maxScrollDepth = Math.max(
        maxScrollDepth,
        await scrollForPersona(page, persona, traits, config, onEvent, 0.8),
      );
    }
    await dwellForPersona(persona, traits, 1.1);
  }

  return {
    pageviews,
    internalClicks,
    scrollDepth: maxScrollDepth,
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    finalUrl: page.url(),
    backToSerp,
    branch,
  };
}
