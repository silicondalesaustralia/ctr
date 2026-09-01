import type { Page } from "playwright";
import {
  citeMatchesDomain,
  classifyGoogleSerpHref,
  domainMatches,
  isGoogleRedirectHref,
  isGoogleRedirectPage,
  resolveGoogleSerpHref,
} from "../utils/helpers.js";

export interface SerpResult {
  position: number;
  title: string;
  url: string;
  displayedUrl: string;
  serpPage: number;
  hrefKind?: ReturnType<typeof classifyGoogleSerpHref>;
}

interface SerpLinkCandidate {
  href: string;
  title: string;
  displayedUrl: string;
}

export function candidateMatchesTarget(
  candidate: SerpLinkCandidate,
  targetDomain: string,
): boolean {
  if (candidate.displayedUrl && citeMatchesDomain(candidate.displayedUrl, targetDomain)) {
    return true;
  }

  if (isGoogleRedirectHref(candidate.href)) {
    return false;
  }

  const resolvedHref = resolveGoogleSerpHref(candidate.href);
  return resolvedHref.startsWith("http") && domainMatches(resolvedHref, targetDomain);
}

export function isOrganicCandidate(candidate: SerpLinkCandidate): boolean {
  const kind = classifyGoogleSerpHref(candidate.href);
  if (kind === "url_redirect" || kind === "goto_redirect") {
    return true;
  }
  if (candidate.displayedUrl.length > 3) {
    return true;
  }
  const resolvedHref = resolveGoogleSerpHref(candidate.href);
  return resolvedHref.startsWith("http") && !/google\.com/i.test(resolvedHref);
}

const ORGANIC_SELECTORS = [
  "#search .g a[href]",
  "#rso .g a[href]",
  "div.MjjYud a[href]",
  ".search-result a[href]",
  "article.result a[href]",
  "ol.organic-results li a[href]",
];

async function extractDisplayedUrl(link: ReturnType<Page["locator"]>): Promise<string> {
  const citeSelectors = [
    "xpath=ancestor::*[contains(@class,'g') or contains(@class,'MjjYud')][1]//cite",
    "xpath=ancestor::*[@data-hveid][1]//cite",
    "xpath=ancestor::*[contains(@class,'g') or contains(@class,'MjjYud')][1]//*[contains(@class,'tjvcx') or contains(@class,'ynAwRc')]",
  ];

  for (const selector of citeSelectors) {
    const text = await link.locator(selector).first().innerText().catch(() => "");
    if (text.trim().length > 3) {
      return text.trim();
    }
  }

  const aria = (await link.getAttribute("aria-label").catch(() => "")) ?? "";
  const ariaMatch = aria.match(/https?:\/\/[^\s]+|[\w.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i);
  return ariaMatch?.[0]?.trim() ?? "";
}

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
      const displayedUrl = await extractDisplayedUrl(link);
      links.push({ href, title, displayedUrl });
    }
    if (links.length > 0) {
      return links;
    }
  }

  return page.evaluate(() => {
    const links: Array<{ href: string; title: string; displayedUrl: string }> = [];
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
      const citeText = (block?.querySelector("cite")?.textContent ?? "").trim();
      const crumb =
        citeText ||
        (
          block?.querySelector(".tjvcx, .ynAwRc, span[style*='color']")?.textContent ?? ""
        ).trim();
      links.push({ href, title, displayedUrl: crumb });
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
      const hrefKind = classifyGoogleSerpHref(candidate.href);
      return {
        position,
        title: candidate.title,
        url: candidate.href,
        displayedUrl: resolvedHref.startsWith("http") && !isGoogleRedirectHref(candidate.href)
          ? resolvedHref
          : candidate.displayedUrl || resolvedHref,
        serpPage,
        hrefKind,
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function waitForSerpRedirectSettle(page: Page, timeoutMs = 15_000): Promise<string> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = page.url();
    if (!isGoogleRedirectPage(current)) {
      return current;
    }
    await page.waitForTimeout(250);
  }

  return page.url();
}

export async function clickSerpResult(page: Page, result: SerpResult): Promise<void> {
  // Google often duplicates /goto hrefs: a visible organic link plus a hidden empty <a>.
  // Prefer a visible match so we don't hang waiting on the invisible twin.
  const visibleByHref = page.locator(`a[href="${result.url}"]`).filter({ visible: true });
  if ((await visibleByHref.count()) > 0) {
    const link = visibleByHref.first();
    await link.scrollIntoViewIfNeeded().catch(() => undefined);
    await link.click({ timeout: 15_000 });
    await waitForSerpRedirectSettle(page);
    return;
  }

  const titleSnippet = result.title.replace(/\s+/g, " ").trim().slice(0, 40);
  if (titleSnippet.length >= 4) {
    const byTitle = page.locator("a").filter({ hasText: titleSnippet, visible: true });
    if ((await byTitle.count()) > 0) {
      const link = byTitle.first();
      await link.scrollIntoViewIfNeeded().catch(() => undefined);
      await link.click({ timeout: 15_000 });
      await waitForSerpRedirectSettle(page);
      return;
    }

    const byRegex = page
      .locator("a")
      .filter({ hasText: new RegExp(escapeRegex(titleSnippet), "i"), visible: true });
    if ((await byRegex.count()) > 0) {
      const link = byRegex.first();
      await link.scrollIntoViewIfNeeded().catch(() => undefined);
      await link.click({ timeout: 15_000 });
      await waitForSerpRedirectSettle(page);
      return;
    }
  }

  // Last resort: force-click any matching href (including non-visible) via JS.
  const forced = page.locator(`a[href="${result.url}"]`).first();
  if ((await forced.count()) > 0) {
    await forced.evaluate((el: HTMLElement) => el.click());
    await waitForSerpRedirectSettle(page);
    return;
  }

  throw new Error(`Could not click SERP result: ${titleSnippet || result.url}`);
}
