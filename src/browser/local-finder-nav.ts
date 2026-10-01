import type { Page } from "./pw.js";
import { acceptConsentIfPresent, assertNotBlocked } from "./blocked-detection.js";
import { mapsSearchUrl } from "./local-pack-collect.js";

const MORE_BUSINESSES_LINK = 'a[href*="udm=local"], a[href*="udm=1"], a[href*="tbm=lcl"]';
const LOCAL_FINDER_URL = /[?&](udm=(1|local)|tbm=lcl)(&|$)/i;

/** Last-resort URL: a direct jump draws CAPTCHAs far more often than clicking "More businesses". */
export function localFinderUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://www.google.com.au/search?q=${q}&udm=1&hl=en-AU&gl=au`;
}

export function isLocalFinderPage(url: string): boolean {
  return LOCAL_FINDER_URL.test(url);
}

export function isMapsSearchPage(url: string): boolean {
  return /google\.[^/]*\/maps\/search/i.test(url);
}

export async function gotoSettled(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|Navigation interrupted|interrupted by another navigation/i.test(message)) {
      throw error;
    }
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(1000);
  }
}

export async function scrollPlacesList(page: Page, iterations = 10): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    const scrolled = await page
      .evaluate(() => {
        const feed =
          document.querySelector("[role='feed']") ??
          document.querySelector("#search") ??
          document.scrollingElement;
        if (feed) feed.scrollBy(0, 700);
        else window.scrollBy(0, 700);
      })
      .then(() => true)
      .catch((error: unknown) => {
        console.error(`[gmb] places scroll interrupted: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      });
    if (!scrolled) await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(450);
  }
}

/** Real mouse click on the SERP's "More businesses" link; false when absent or it didn't navigate. */
async function clickMoreBusinesses(page: Page): Promise<boolean> {
  const link = await page.$(MORE_BUSINESSES_LINK);
  if (!link) return false;
  await link.evaluate((el) => el.scrollIntoView({ block: "center" }));
  // The link animates in with the local pack; clicking before it settles is a no-op.
  await page.waitForTimeout(1500);
  const box = await link.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(300);
  await page.mouse.click(x, y);
  return page.waitForURL(LOCAL_FINDER_URL, { timeout: 15_000 }).then(
    () => true,
    () => false,
  );
}

/** Open Google's Places list the way a user does: "More businesses" from the SERP. */
export async function openLocalFinder(page: Page, query: string): Promise<void> {
  if (isLocalFinderPage(page.url())) return;
  if (!(await clickMoreBusinesses(page))) {
    console.error("[gmb] No usable 'More businesses' link; opening Places list by URL");
    await gotoSettled(page, localFinderUrl(query));
  }
  await acceptConsentIfPresent(page);
  await page.waitForTimeout(2000);
  await assertNotBlocked(page);
  await scrollPlacesList(page);
}

/** Keyword-only Maps search, used when the Places list is empty. */
export async function openMapsSearch(page: Page, query: string): Promise<void> {
  const target = mapsSearchUrl(query);
  if (page.url().startsWith(target.split("?")[0]!)) return;
  await gotoSettled(page, target);
  await acceptConsentIfPresent(page);
  await page.waitForTimeout(2500);
  await assertNotBlocked(page);
  await scrollPlacesList(page, 6);
}
