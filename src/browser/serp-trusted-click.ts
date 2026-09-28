import type { ElementHandle, Locator, Page } from "./pw.js";
import { randomBetween } from "../utils/helpers.js";

export const SERP_ANCHOR_SELECTOR = "#search a[href], #rso a[href], div.MjjYud a[href]";

/**
 * Hover + click with a real (trusted) mouse event. Falls back to a DOM click when the
 * pointer is intercepted (e.g. Google's sticky header overlapping the target).
 */
export async function trustedClick(
  page: Page,
  target: Locator | ElementHandle,
  via: string,
): Promise<string> {
  try {
    await page.waitForTimeout(randomBetween(400, 1100));
    await target.hover({ timeout: 5_000 });
    await page.waitForTimeout(randomBetween(250, 800));
    await target.click({ timeout: 8_000 });
    return `${via}-mouse`;
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(`[click] mouse click failed (${reason}); falling back to DOM click`);
    await target.dispatchEvent("click");
    return `${via}-dom`;
  }
}

/** Clicks an element picked in-page via evaluateHandle; returns null if nothing was picked. */
export async function trustedClickPicked(
  page: Page,
  picked: ElementHandle | null,
  via: string,
): Promise<string | null> {
  if (!picked) return null;
  try {
    return await trustedClick(page, picked, via);
  } finally {
    await picked.dispose().catch(() => undefined);
  }
}
