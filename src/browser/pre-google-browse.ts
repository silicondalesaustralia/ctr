import type { Page } from "./pw.js";
import { randomBetween, sleep } from "../utils/helpers.js";

const AU_WARM_SITES = [
  "https://www.abc.net.au/",
  "https://www.bom.gov.au/",
  "https://www.news.com.au/",
  "https://www.smh.com.au/",
  "https://www.theage.com.au/",
];

export interface BrowseAuSitesOptions {
  minSites?: number;
  maxSites?: number;
  /** Longer dwells for cookie-age browse-only sessions. */
  longDwell?: boolean;
}

/**
 * Browse normal AU sites (never Google) to age cookies / look human.
 */
export async function browseAuSites(
  page: Page,
  options: BrowseAuSitesOptions = {},
): Promise<string[]> {
  const minSites = options.minSites ?? 1;
  const maxSites = Math.max(minSites, options.maxSites ?? 2);
  const longDwell = options.longDwell ?? false;
  const visited: string[] = [];
  const count = randomBetween(minSites, maxSites);
  const pool = [...AU_WARM_SITES];

  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = randomBetween(0, pool.length - 1);
    const url = pool.splice(index, 1)[0]!;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      visited.push(url);
      await sleep(randomBetween(longDwell ? 5_000 : 2_500, longDwell ? 14_000 : 6_000));
      await page.mouse.wheel(0, randomBetween(200, 900));
      await sleep(randomBetween(longDwell ? 3_000 : 1_500, longDwell ? 8_000 : 4_000));
      if (longDwell && Math.random() > 0.4) {
        await page.mouse.wheel(0, randomBetween(300, 1_200));
        await sleep(randomBetween(2_000, 5_000));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[warmup] AU browse failed for ${url}: ${message}`);
    }
  }

  return visited;
}

/**
 * Short AU softener before Google so the session is not Search-only.
 */
export async function browseAuSitesBeforeGoogle(page: Page): Promise<string[]> {
  return browseAuSites(page, { minSites: 1, maxSites: 2 });
}
