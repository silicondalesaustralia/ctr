import type { Page } from "playwright";
import { domainMatches, resolveGoogleSerpHref } from "../utils/helpers.js";

export interface SerpResult {
  position: number;
  title: string;
  url: string;
  displayedUrl: string;
  serpPage: number;
}

interface SerpLinkCandidate {
  href: string;
  title: string;
}

const ORGANIC_SELECTORS = [
  "#search .g a[href]",
  "#rso .g a[href]",
  "div.MjjYud a[href]",
  ".search-result a[href]",
  "article.result a[href]",
  "ol.organic-results li a[href]",
];

async function collectSerpLinkCandidates(page: Page): Promise<SerpLinkCandidate[]> {
  for (const selector of ORGANIC_SELECTORS) {
    const candidate = page.locator(selector);
    if ((await candidate.count()) === 0) {
      continue;
    }

    const links: SerpLinkCandidate[] = [];
    const count = await candidate.count();
    for (let i = 0; i < count; i += 1) {
      const link = candidate.nth(i);
      const href = await link.getAttribute("href");
      if (!href || href.startsWith("#") || href.includes("google.com/search")) {
        continue;
      }
      const title = (await link.innerText().catch(() => "")).trim();
      if (!title) {
        continue;
      }
      links.push({ href, title });
    }
    if (links.length > 0) {
      return links;
    }
  }

  return page.evaluate(() => {
    const links: SerpLinkCandidate[] = [];
    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.includes("google.com/search")) {
        continue;
      }
      if (/google\.com\/(sorry|accounts|preferences|maps)/i.test(href)) {
        continue;
      }
      const title = (anchor.textContent ?? "").trim();
      if (title.length < 4) {
        continue;
      }
      links.push({ href, title });
    }
    return links;
  });
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
    await page.waitForTimeout(1000);

    const candidates = await collectSerpLinkCandidates(page);
    let position = 0;

    for (const candidate of candidates) {
      const resolvedHref = resolveGoogleSerpHref(candidate.href);
      if (!resolvedHref.startsWith("http")) {
        continue;
      }

      position += 1;
      if (domainMatches(resolvedHref, targetDomain)) {
        return {
          result: {
            position,
            title: candidate.title,
            url: candidate.href,
            displayedUrl: resolvedHref,
            serpPage,
          },
          pagesSearched,
        };
      }
    }

    if (serpPage >= maxPages) break;

    const nextButton = page
      .locator(
        'a#pnnext, a:has-text("Next"), a[aria-label="Next page"], a[aria-label="More search results"]',
      )
      .first();
    if (!(await nextButton.isVisible().catch(() => false))) {
      break;
    }
    await nextButton.click();
    await page.waitForTimeout(2000);
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
