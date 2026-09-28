import type { Page } from "./pw.js";
import {
  citeMatchesDomain,
  classifyGoogleSerpHref,
  domainMatches,
  isGoogleRedirectHref,
  isGoogleRedirectPage,
  resolveGoogleSerpHref,
} from "../utils/helpers.js";
import { SERP_ANCHOR_SELECTOR, trustedClickPicked } from "./serp-trusted-click.js";

/** Bump when click strategy changes — visible in worker logs to confirm deploy. */
export const SERP_CLICK_STRATEGY = "v4-handle-mouse";

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
  // Result-title anchors are the most layout-stable organic signal (Chrome and Firefox SERPs).
  "#rso a[href]:has(h3)",
  "#search a[href]:has(h3)",
  "#search .g a[href]",
  "#rso .g a[href]",
  "div.MjjYud a[href]",
  ".search-result a[href]",
  "article.result a[href]",
  "ol.organic-results li a[href]",
];

/** Single page.evaluate round-trip — avoids ~11 min Playwright-per-link scans over cloud CDP. */
export async function collectSerpLinkCandidates(page: Page): Promise<SerpLinkCandidate[]> {
  return page.evaluate((selectors) => {
    const links: Array<{ href: string; title: string; displayedUrl: string }> = [];
    const seen = new Set<string>();

    for (const selector of selectors) {
      for (const anchor of Array.from(document.querySelectorAll(selector))) {
        const href = anchor.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("/search") || href.includes("google.com/search")) {
          continue;
        }
        if (/google\.com\/(sorry|accounts|preferences|maps)/i.test(href)) {
          continue;
        }
        const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
        if (title.length < 4) {
          continue;
        }
        const key = `${href}::${title.slice(0, 48)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const block = anchor.closest(".g, .MjjYud, [data-hveid]");
        const citeText = (block?.querySelector("cite")?.textContent ?? "").trim();
        let displayedUrl = citeText.length > 3 ? citeText : "";
        if (!displayedUrl) {
          displayedUrl = (
            block?.querySelector(".tjvcx, .ynAwRc, span[style*='color']")?.textContent ?? ""
          ).trim();
        }
        if (!displayedUrl) {
          const aria = anchor.getAttribute("aria-label") ?? "";
          const ariaMatch = aria.match(/https?:\/\/[^\s]+|[\w.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i);
          displayedUrl = ariaMatch?.[0]?.trim() ?? "";
        }

        links.push({ href, title, displayedUrl });
      }
      // Inline callback: named functions inside evaluate get tsx's __name helper, which the page lacks.
      if (
        links.some(
          (link) =>
            /^\/(url|goto)\?/.test(link.href) ||
            /google\.[a-z.]+\/(url|goto)\?/.test(link.href) ||
            (/^https?:/.test(link.href) && !/google\./.test(link.href)) ||
            link.displayedUrl.length > 3,
        )
      ) {
        return links;
      }
      links.length = 0;
      seen.clear();
    }

    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("/search") || href.includes("google.com/search")) {
        continue;
      }
      if (/google\.com\/(sorry|accounts|preferences|maps)/i.test(href)) {
        continue;
      }
      const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 4) {
        continue;
      }
      const key = `${href}::${title.slice(0, 48)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const block = anchor.closest(".g, .MjjYud, [data-hveid]");
      const citeText = (block?.querySelector("cite")?.textContent ?? "").trim();
      let displayedUrl = citeText.length > 3 ? citeText : "";
      if (!displayedUrl) {
        displayedUrl = (
          block?.querySelector(".tjvcx, .ynAwRc, span[style*='color']")?.textContent ?? ""
        ).trim();
      }
      if (!displayedUrl) {
        const aria = anchor.getAttribute("aria-label") ?? "";
        const ariaMatch = aria.match(/https?:\/\/[^\s]+|[\w.-]+\.[a-z]{2,}(?:\/[^\s]*)?/i);
        displayedUrl = ariaMatch?.[0]?.trim() ?? "";
      }

      links.push({ href, title, displayedUrl });
    }
    return links;
  }, ORGANIC_SELECTORS);
}

export async function findTargetOnCurrentPage(
  page: Page,
  targetDomain: string,
  serpPage: number,
): Promise<SerpResult | null> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const scanStart = Date.now();
  const candidates = await collectSerpLinkCandidates(page);
  console.error(
    `[serp] collected ${candidates.length} link candidates in ${Date.now() - scanStart}ms`,
  );
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
  const titleSnippet = result.title.replace(/\s+/g, " ").trim().slice(0, 60);
  console.error(
    `[serp] ${SERP_CLICK_STRATEGY} click title="${titleSnippet.slice(0, 40)}" hrefKind=${result.hrefKind ?? "unknown"}`,
  );

  // Pick the exact element in-page (prefer its h3 title), then click that handle with a
  // real mouse so the event is trusted and Camoufox's humanized cursor moves to it.
  const pick = await page.evaluateHandle(
    ({ title, href, selector }): HTMLElement | null => {
      const organicAnchors = Array.from(document.querySelectorAll(selector)) as HTMLElement[];

      const needle = title.toLowerCase().slice(0, 24);
      if (needle.length >= 4) {
        for (const el of organicAnchors) {
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
          if (!text.includes(needle)) {
            continue;
          }
          if ((el.textContent ?? "").trim().length < 4) {
            continue;
          }
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (
            style.visibility === "hidden" ||
            style.display === "none" ||
            style.opacity === "0" ||
            rect.width <= 0 ||
            rect.height <= 0
          ) {
            continue;
          }
          el.scrollIntoView({ block: "center", inline: "nearest" });
          return (el.querySelector("h3") as HTMLElement | null) ?? el;
        }
      }

      const hrefMatches: HTMLElement[] = [];
      for (const el of organicAnchors) {
        if (el.getAttribute("href") === href) {
          hrefMatches.push(el);
        }
      }

      for (const el of hrefMatches) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          style.opacity === "0" ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          continue;
        }
        if ((el.textContent ?? "").trim().length > 0) {
          el.scrollIntoView({ block: "center", inline: "nearest" });
          return (el.querySelector("h3") as HTMLElement | null) ?? el;
        }
      }

      for (const el of hrefMatches) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          style.opacity === "0" ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          continue;
        }
        el.scrollIntoView({ block: "center", inline: "nearest" });
        return el;
      }

      return null;
    },
    { title: titleSnippet, href: result.url, selector: SERP_ANCHOR_SELECTOR },
  );

  const clickedVia = await trustedClickPicked(page, pick.asElement(), "serp");
  if (!clickedVia) {
    throw new Error(`Could not click SERP result (${SERP_CLICK_STRATEGY}): ${titleSnippet}`);
  }
  console.error(`[serp] clicked via ${clickedVia}`);
  await waitForSerpRedirectSettle(page);
}
