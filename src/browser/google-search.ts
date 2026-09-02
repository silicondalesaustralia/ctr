import type { Page } from "playwright";
import { getEnv } from "../config/env.js";
import { getMockSerpUrl, loadMockSerpInPage } from "../utils/helpers.js";
import {
  effectivePauseMs,
  effectiveTypingDelayMs,
} from "../behaviour/behaviour-config.js";
import type { Persona, SessionTraits } from "../behaviour/types.js";
import { randomBetween, sleep } from "../utils/helpers.js";
import { acceptConsentIfPresent, detectBlockedPage } from "./blocked-detection.js";

export async function openGoogle(page: Page): Promise<void> {
  await page.goto("https://www.google.com.au/?hl=en-AU&gl=au", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await acceptConsentIfPresent(page);
}

export async function loadDryRunSerp(
  page: Page,
  targetDomain: string,
  query: string,
  targetPath = "/",
): Promise<void> {
  if (getEnv().BROWSER_PROFILE_PROVIDER === "gologin") {
    await loadMockSerpInPage(page, targetDomain, query, targetPath);
    return;
  }

  await page.goto(getMockSerpUrl(targetDomain, query, targetPath), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
}

export async function typeAndSubmitQuery(
  page: Page,
  query: string,
  persona: Persona,
  traits: SessionTraits,
): Promise<void> {
  const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
  await searchBox.waitFor({ state: "visible", timeout: 15_000 });
  await searchBox.click();

  const prePause = effectivePauseMs(persona.preTypePauseMs, traits);
  await sleep(randomBetween(prePause[0], prePause[1]));

  await searchBox.fill("");

  const typingDelay = effectiveTypingDelayMs(persona, traits);
  const perKeyDelay = randomBetween(typingDelay[0], typingDelay[1]);
  await page.keyboard.type(query, { delay: perKeyDelay });

  const postPause = effectivePauseMs(persona.postTypePauseMs, traits);
  await sleep(randomBetween(postPause[0], postPause[1]));

  await page.keyboard.press("Enter");
  // Enter often triggers redirects (including lite `gbv=2`). Wait for /search and settle
  // before any follow-up goto — racing that causes net::ERR_ABORTED.
  await Promise.race([
    page.waitForURL(/google\.[^/]+\/search\?/i, { timeout: 30_000 }),
    page.waitForLoadState("domcontentloaded"),
  ]).catch(() => undefined);
  await sleep(randomBetween(800, 1600));
  await acceptConsentIfPresent(page);
  await ensureFullGoogleSearch(page, query);
}

/** Google sometimes serves lite HTML (`gbv=2`) to headless Orbita — no local pack DOM. */
export function isLiteGooglePage(url: string): boolean {
  return /[?&]gbv=2/i.test(url) || url.includes("heirloom-hp");
}

function isNavigationAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ERR_ABORTED|Navigation interrupted|interrupted by another navigation/i.test(message);
}

async function gotoGoogleSearchSettled(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (error) {
    if (!isNavigationAbortError(error)) throw error;
    // Chrome aborts when Google redirects mid-goto; the final URL is often usable.
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await sleep(randomBetween(500, 1200));
  }
}

export async function ensureFullGoogleSearch(page: Page, query: string): Promise<void> {
  if (!isLiteGooglePage(page.url())) return;

  const fullUrl = `https://www.google.com.au/search?q=${encodeURIComponent(query)}&hl=en-AU&gl=au`;
  await gotoGoogleSearchSettled(page, fullUrl);
  await acceptConsentIfPresent(page);

  if (isLiteGooglePage(page.url())) {
    await navigateGoogleLocalFinder(page, query);
  }
}

export async function navigateGoogleLocalFinder(page: Page, query: string): Promise<void> {
  const { openLocalFinder } = await import("./local-pack.js");
  await openLocalFinder(page, query);
}

export async function checkBlocked(page: Page): Promise<{
  blocked: boolean;
  reason?: string;
}> {
  const blocked = await detectBlockedPage(page);
  return { blocked: blocked.blocked, reason: blocked.reason };
}

export async function runDirectFlow(
  page: Page,
  targetUrl: string,
): Promise<{ landingUrl: string; blocked: boolean; blockReason?: string }> {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const blocked = await detectBlockedPage(page);
  return {
    landingUrl: page.url(),
    blocked: blocked.blocked,
    blockReason: blocked.reason,
  };
}
