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
  displayedUrl: string;
}

function candidateMatchesTarget(candidate: SerpLinkCandidate, targetDomain: string): boolean {
  const resolvedHref = resolveGoogleSerpHref(candidate.href);
  if (resolvedHref.startsWith("http") && domainMatches(resolvedHref, targetDomain)) {
    return true;
  }

  const normalizedTarget = targetDomain.replace(/^www\./, "").toLowerCase();
  const citeHaystack = candidate.displayedUrl.toLowerCase();
  return citeHaystack.includes(normalizedTarget);
}

export function isOrganicCandidate(candidate: SerpLinkCandidate): boolean {
  const resolvedHref = resolveGoogleSerpHref(candidate.href);
  if (resolvedHref.startsWith("http") && !/google\.com/i.test(resolvedHref)) {
    return true;
  }
  if (candidate.displayedUrl.length > 3) {
    return true;
  }
  return candidate.href.includes("/goto?");
}

const ORGANIC_SELECTORS = [
  "#search .g a[href]",
  "#rso .g a[href]",
  "div.MjjYud a[href]",
  ".search-result a[href]",
  "article.result a[href]",
  "ol.organic-results li a[href]",
];

export async function collectSerpLinkCandidates(page: Page): Promise<SerpLinkCandidate[]> {
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
      const displayedUrl = await link
        .locator("xpath=ancestor::*[contains(@class,'g') or contains(@class,'MjjYud')][1]//cite")
        .first()
        .innerText()
        .catch(() => "");
      links.push({ href, title, displayedUrl: displayedUrl.trim() });
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
      const block = anchor.closest(".g, .MjjYud, [data-hveid]");
      const displayedUrl = (block?.querySelector("cite")?.textContent ?? "").trim();
      links.push({ href, title, displayedUrl });
    }
    return links;
  });
}

export async function findTargetOnCurrentPage(
  page: Page,
  targetDomain: string,
  serpPage: number,
): Promise<SerpResult | null> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const candidates = await collectSerpLinkCandidates(page);
  let position = 0;

  for (const candidate of candidates) {
    if (!isOrganicCandidate(candidate)) {
      continue;
    }

    position += 1;
    if (candidateMatchesTarget(candidate, targetDomain)) {
      const resolvedHref = resolveGoogleSerpHref(candidate.href);
      return {
        position,
        title: candidate.title,
        url: candidate.href,
        displayedUrl: resolvedHref.startsWith("http")
          ? resolvedHref
          : candidate.displayedUrl,
        serpPage,
      };
    }
  }

  return null;
}

export async function goToNextSerpPage(page: Page): Promise<boolean> {
  const nextButton = page
    .locator(
      'a#pnnext, a:has-text("Next"), a[aria-label="Next page"], a[aria-label="More search results"]',
    )
    .first();

  if (!(await nextButton.isVisible().catch(() => false))) {
    return false;
  }

  await nextButton.click();
  await page.waitForTimeout(2000);
  return true;
}

export async function findTargetInSerp(
  page: Page,
  targetDomain: string,
  maxPages: number,
): Promise<{ result: SerpResult | null; pagesSearched: number }> {
  let pagesSearched = 0;

  for (let serpPage = 1; serpPage <= maxPages; serpPage += 1) {
    pagesSearched = serpPage;
    await page.waitForTimeout(1000);

    const result = await findTargetOnCurrentPage(page, targetDomain, serpPage);
    if (result) {
      return { result, pagesSearched };
    }

    if (serpPage >= maxPages) break;

    const hasNext = await goToNextSerpPage(page);
    if (!hasNext) {
      break;
    }
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
