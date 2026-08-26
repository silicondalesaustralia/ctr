import type { Page } from "playwright";
import { getEnv, isDryRun } from "../config/env.js";
import { getMockSerpUrl, loadMockSerpInPage } from "../utils/helpers.js";
import { acceptConsentIfPresent, detectBlockedPage } from "./blocked-detection.js";
import { clickSerpResult, findTargetInSerp, type SerpResult } from "./serp-parser.js";
import { randomBetween, sleep } from "../utils/helpers.js";

export interface SearchFlowInput {
  page: Page;
  query: string;
  targetDomain: string;
  maxSerpPages: number;
}

export interface SearchFlowResult {
  googleLoaded: boolean;
  searchSubmitted: boolean;
  blocked: boolean;
  blockReason?: string;
  targetFound: boolean;
  targetClicked: boolean;
  serpPage?: number;
  observedPosition?: number;
  resultTitle?: string;
  resultUrl?: string;
  landingUrl?: string;
}

export async function runSearchFlow(input: SearchFlowInput): Promise<SearchFlowResult> {
  const { page, query, targetDomain, maxSerpPages } = input;
  const result: SearchFlowResult = {
    googleLoaded: false,
    searchSubmitted: false,
    blocked: false,
    targetFound: false,
    targetClicked: false,
  };

  if (isDryRun()) {
    if (getEnv().BROWSER_PROFILE_PROVIDER === "gologin") {
      await loadMockSerpInPage(page, targetDomain, query);
    } else {
      await page.goto(getMockSerpUrl(targetDomain, query), {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
  } else {
    await page.goto("https://www.google.com.au/", { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  result.googleLoaded = true;

  if (!isDryRun()) {
    await acceptConsentIfPresent(page);
  }

  let blocked = await detectBlockedPage(page);
  if (blocked.blocked) {
    result.blocked = true;
    result.blockReason = blocked.reason;
    return result;
  }

  if (!isDryRun()) {
    const searchBox = page.locator('textarea[name="q"], input[name="q"]').first();
    await searchBox.click();
    await sleep(randomBetween(700, 2000));
    await searchBox.fill("");
    await page.keyboard.type(query, { delay: randomBetween(40, 120) });
    await sleep(randomBetween(500, 1500));
    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    result.searchSubmitted = true;
  } else {
    result.searchSubmitted = true;
  }

  blocked = await detectBlockedPage(page);
  if (blocked.blocked) {
    result.blocked = true;
    result.blockReason = blocked.reason;
    return result;
  }

  const serp = await findTargetInSerp(page, targetDomain, maxSerpPages);
  if (!serp.result) {
    return result;
  }

  result.targetFound = true;
  result.serpPage = serp.result.serpPage;
  result.observedPosition = serp.result.position;
  result.resultTitle = serp.result.title;
  result.resultUrl = serp.result.url;

  await clickSerpResult(page, serp.result);
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  result.targetClicked = true;
  result.landingUrl = page.url();

  return result;
}

export async function runDirectFlow(
  page: Page,
  targetUrl: string,
): Promise<{ landingUrl: string; blocked: boolean; blockReason?: string }> {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const blocked = await detectBlockedPage(page);
  return {
    landingUrl: page.url(),
    blocked: blocked.blocked,
    blockReason: blocked.reason,
  };
}

export type { SerpResult };
