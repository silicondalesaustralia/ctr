import type { Page } from "playwright";

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
