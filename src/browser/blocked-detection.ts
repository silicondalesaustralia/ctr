import type { Page } from "./pw.js";

const BLOCKED_PATTERNS = [
  /unusual traffic/i,
  /captcha/i,
  /recaptcha/i,
  /verify you are human/i,
  /automated queries/i,
  /access denied/i,
];

export interface BlockCheckResult {
  blocked: boolean;
  reason?: string;
}

/** Google answered a page change (next results page, Places list, Maps) with a CAPTCHA. */
export class GoogleBlockedError extends Error {
  constructor(readonly reason: string, message = `Google blocked the page: ${reason}`) {
    super(message);
    this.name = "GoogleBlockedError";
  }
}

export async function assertNotBlocked(page: Page): Promise<void> {
  const blocked = await detectBlockedPage(page);
  if (blocked.blocked) throw new GoogleBlockedError(blocked.reason ?? "blocked");
}

export function checkBlockedSignals(url: string, bodyText: string): BlockCheckResult {
  if (/sorry\/index/i.test(url)) {
    return { blocked: true, reason: "google_sorry_page" };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(bodyText) || pattern.test(url)) {
      return { blocked: true, reason: pattern.source };
    }
  }

  if (/recaptcha|form\[action\*="sorry"\]|id="captcha"/i.test(bodyText)) {
    return { blocked: true, reason: "captcha_detected" };
  }

  return { blocked: false };
}

export async function detectBlockedPage(page: Page): Promise<BlockCheckResult> {
  const url = page.url();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const frameBlocked = await page
    .locator('iframe[src*="recaptcha"], #captcha, form[action*="sorry"]')
    .count();

  const signal = checkBlockedSignals(url, bodyText);
  if (signal.blocked) return signal;

  if (frameBlocked > 0) {
    return { blocked: true, reason: "captcha_detected" };
  }

  return { blocked: false };
}

/**
 * A results page with no result titles is an interstitial (JS check, soft block),
 * not "target not found" — logs what Google served and treats it as a block.
 */
export async function assertSerpHasResults(page: Page, resultTitleSelector: string): Promise<void> {
  const snapshot = await page.evaluate((selector) => ({
    titles: document.querySelectorAll(selector).length,
    title: document.title,
    body: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
  }), resultTitleSelector);
  if (snapshot.titles > 0) return;
  console.error(`[serp] no results on page url=${page.url()} title="${snapshot.title}" body="${snapshot.body}"`);
  throw new GoogleBlockedError("serp_without_results");
}

export async function acceptConsentIfPresent(page: Page): Promise<boolean> {
  const selectors = [
    "#L2AGLb",
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Accept")',
    'button:has-text("Reject all")',
  ];

  for (const selector of selectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(1500);
      return true;
    }
  }

  return false;
}
