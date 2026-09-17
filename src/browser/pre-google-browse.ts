import type { Page } from "./pw.js";
import { randomBetween, sleep } from "../utils/helpers.js";

const AU_WARM_SITES = [
  "https://www.abc.net.au/",
  "https://www.bom.gov.au/",
  "https://www.news.com.au/",
  "https://www.smh.com.au/",
  "https://www.theage.com.au/",
];

/**
 * Browse a couple of normal AU sites before Google so the session
 * does not look like a brand-new browser that only ever hits Search.
 */
export async function browseAuSitesBeforeGoogle(page: Page): Promise<string[]> {
  const visited: string[] = [];
  const count = randomBetween(1, 2);
  const pool = [...AU_WARM_SITES];

  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const index = randomBetween(0, pool.length - 1);
    const url = pool.splice(index, 1)[0]!;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      visited.push(url);
      await sleep(randomBetween(2_500, 6_000));
      await page.mouse.wheel(0, randomBetween(200, 900));
      await sleep(randomBetween(1_500, 4_000));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[warmup] pre-google browse failed for ${url}: ${message}`);
    }
  }

  return visited;
}
