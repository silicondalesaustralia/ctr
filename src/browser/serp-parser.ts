import type { Page } from "playwright";
import { domainMatches } from "../utils/helpers.js";

export interface SerpResult {
  position: number;
  title: string;
  url: string;
  displayedUrl: string;
  serpPage: number;
}

export async function findTargetInSerp(
  page: Page,
  targetDomain: string,
  maxPages: number,
): Promise<{ result: SerpResult | null; pagesSearched: number }> {
  let pagesSearched = 0;

  for (let serpPage = 1; serpPage <= maxPages; serpPage += 1) {
    pagesSearched = serpPage;
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);

    const organicSelectors = [
      "#search .g a[href]",
      "#rso .g a[href]",
      ".search-result a[href]",
      "article.result a[href]",
      "ol.organic-results li a[href]",
    ];

    let links = page.locator(organicSelectors[0]!);
    for (const selector of organicSelectors) {
      const candidate = page.locator(selector);
      if ((await candidate.count()) > 0) {
        links = candidate;
        break;
      }
    }

    const count = await links.count();
    let position = 0;

    for (let i = 0; i < count; i += 1) {
      const link = links.nth(i);
      const href = await link.getAttribute("href");
      if (!href || href.startsWith("#") || href.includes("google.com/search")) {
        continue;
      }

      position += 1;
      const title = (await link.innerText().catch(() => "")).trim();
      const displayedUrl =
        (await link.locator("cite, .url, .displayed-url").first().innerText().catch(() => "")) ||
        href;

      if (domainMatches(href, targetDomain)) {
        return {
          result: {
            position,
            title,
            url: href,
            displayedUrl,
            serpPage,
          },
          pagesSearched,
        };
      }
    }

    if (serpPage >= maxPages) break;

    const nextButton = page.locator('a#pnnext, a:has-text("Next"), a[aria-label="Next page"]').first();
    if (!(await nextButton.isVisible().catch(() => false))) {
      break;
    }
    await nextButton.click();
    await page.waitForTimeout(1500);
  }

  return { result: null, pagesSearched };
}

export async function clickSerpResult(page: Page, result: SerpResult): Promise<void> {
  const link = page.locator(`a[href="${result.url}"]`).first();
  if (await link.count()) {
    await link.click();
    return;
  }

  const fallback = page.locator(`a:has-text("${result.title.slice(0, 40)}")`).first();
  await fallback.click();
}
