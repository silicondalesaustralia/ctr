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
): Promise<void> {
  if (getEnv().BROWSER_PROFILE_PROVIDER === "gologin") {
    await loadMockSerpInPage(page, targetDomain, query);
    return;
  }

  await page.goto(getMockSerpUrl(targetDomain, query), {
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
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await acceptConsentIfPresent(page);
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
