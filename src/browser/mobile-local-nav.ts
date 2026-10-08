import type { Page } from "./pw.js";
import { acceptConsentIfPresent, assertNotBlocked } from "./blocked-detection.js";
import { mapsSearchUrl } from "./local-pack-collect.js";
import { gotoSettled } from "./local-finder-nav.js";
import { trustedClick } from "./serp-trusted-click.js";
import { googleTargetForPage } from "../geo/google-target.js";

const MAPS_CARD = ".Nv2PK";

export async function isMobilePage(page: Page): Promise<boolean> {
  return page.evaluate(() => /Android/i.test(navigator.userAgent)).catch(() => false);
}

/** Real mouse click on visible text; false when it isn't on screen. */
async function clickVisibleText(page: Page, text: RegExp): Promise<boolean> {
  const target = page.getByText(text).first();
  if (!(await target.isVisible({ timeout: 2_500 }).catch(() => false))) return false;
  const box = await target.boundingBox();
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

/** Mobile Maps opens behind an "Open the Google Maps app?" sheet, and search results as a map. */
async function settleMobileMaps(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await acceptConsentIfPresent(page);
  await assertNotBlocked(page);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500);
    if (await clickVisibleText(page, /^keep using web$/i)) continue;
    if (await clickVisibleText(page, /^view list$/i)) continue;
    const ready = await page
      .evaluate(
        (card) => document.querySelector(card) !== null || document.querySelector("[role='main'][aria-label]") !== null,
        MAPS_CARD,
      )
      .catch(() => false);
    if (ready) break;
  }
  await page.waitForTimeout(1_500);
  console.error(`[gmb] mobile Maps settled url=${page.url().slice(0, 100)}`);
}

/**
 * The phone SERP's "More places" link is dead (href="#", no handler) and a direct Places-list
 * URL draws CAPTCHAs, so phones reach the full list the way users do: the Maps tab.
 */
export async function openMobileMapsList(page: Page, query: string): Promise<void> {
  const handle = await page.evaluateHandle(
    (): Element | null =>
      Array.from(document.querySelectorAll("a[href*='maps']")).find(
        (a) => (a.textContent ?? "").trim().toLowerCase() === "maps",
      ) ?? null,
  );
  const mapsTab = handle.asElement();
  if (mapsTab) {
    await mapsTab.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await trustedClick(page, mapsTab, "maps-tab");
  } else {
    console.error("[gmb] mobile: no Maps tab on the SERP; opening Maps search by URL");
    await gotoSettled(page, mapsSearchUrl(query, googleTargetForPage(page)));
  }
  await settleMobileMaps(page);
}

/** Branded fallback: Maps search by URL (often lands straight on the place page). */
export async function openMobileMapsSearch(page: Page, query: string): Promise<void> {
  await gotoSettled(page, mapsSearchUrl(query, googleTargetForPage(page)));
  await settleMobileMaps(page);
}

/** Mobile Maps scrolls the results sheet, not the window. */
export async function scrollMobileList(page: Page, iterations = 5): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    await page
      .evaluate((cardSelector) => {
        let el = document.querySelector(cardSelector)?.parentElement ?? null;
        while (el && !(el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY))) {
          el = el.parentElement;
        }
        (el ?? document.scrollingElement)?.scrollBy(0, 700);
      }, MAPS_CARD)
      .catch((error: unknown) => {
        console.error(`[gmb] mobile list scroll interrupted: ${error instanceof Error ? error.message : String(error)}`);
      });
    await page.waitForTimeout(500);
  }
}
