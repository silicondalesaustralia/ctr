import type { Page } from "playwright-core";
import { randomBetween, sleep } from "../src/utils/helpers.js";

export interface SearchOutcome {
  result: "PASSED" | `BLOCKED (${string})` | `FAILED (${string})`;
  url: string;
}

async function blockedReason(page: Page): Promise<string | null> {
  if (/\/sorry\//i.test(page.url())) return "sorry page";
  const text = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  if (/unusual traffic/i.test(text)) return "unusual traffic";
  if (/recaptcha|not a robot/i.test(text)) return "captcha";
  return null;
}

/** EU/UK consent interstitial: accept if shown, otherwise carry on. */
async function acceptConsent(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /accept all|i agree|alle akzeptieren/i }).first();
  if (await accept.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await sleep(randomBetween(800, 2_000));
    await accept.tap().catch(() => accept.click());
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  }
}

/** Google homepage, tap the search box, type like a phone user, submit and check for a block. */
export async function googleSearch(page: Page, domain: string, locale: string, query: string): Promise<SearchOutcome> {
  const hl = locale.split("-")[0] ?? "en";
  await page.goto(`https://${domain}/?hl=${hl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await acceptConsent(page);
  const onHome = await blockedReason(page);
  if (onHome) return { result: `BLOCKED (homepage ${onHome})`, url: page.url() };

  const box = page.locator('textarea[name="q"], input[name="q"]').first();
  try {
    await box.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return { result: "FAILED (no search box)", url: page.url() };
  }
  await sleep(randomBetween(1_000, 2_500));
  await box.tap().catch(() => box.click());
  await sleep(randomBetween(600, 1_500));
  await page.keyboard.type(query, { delay: randomBetween(90, 180) });
  await sleep(randomBetween(700, 1_600));
  await page.keyboard.press("Enter");
  await page.waitForURL(/google\.[^/]+\/(search|sorry)/i, { timeout: 30_000 }).catch(() => undefined);
  await sleep(randomBetween(2_000, 3_500));
  const onSearch = await blockedReason(page);
  if (onSearch) return { result: `BLOCKED (search ${onSearch})`, url: page.url() };
  if (!/\/search/i.test(page.url())) return { result: "FAILED (no results page)", url: page.url() };
  await page.mouse.wheel(0, randomBetween(300, 900)).catch(() => undefined);
  await sleep(randomBetween(1_000, 2_000));
  return { result: "PASSED", url: page.url() };
}
