import type { Page } from "./pw.js";
import { acceptConsentIfPresent } from "./blocked-detection.js";
import {
  CARD_SELECTORS,
  collectLocalPackCandidates,
  mapsSearchUrl,
  type LocalPackCandidate,
} from "./local-pack-collect.js";
import { matchCandidate, type LocalPackResult, type LocalPackTarget } from "./local-pack-match.js";
import { trustedClickPicked } from "./serp-trusted-click.js";
import { goToNextSerpPage } from "./serp-pagination.js";

export type { LocalPackCandidate };
export type { LocalPackResult, LocalPackSource } from "./local-pack-match.js";
export { namesMatch } from "./local-pack-match.js";
export { collectLocalPackCandidates, mapsSearchUrl };

export function localFinderUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://www.google.com.au/search?q=${q}&udm=1&hl=en-AU&gl=au`;
}

export function isLocalFinderPage(url: string): boolean {
  return /[?&]udm=1/i.test(url);
}

export function isMapsSearchPage(url: string): boolean {
  return /google\.[^/]*\/maps\/search/i.test(url);
}

async function gotoSettled(page: Page, url: string): Promise<void> {
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

/** Open Google's local Places list (`udm=1`) — same view as "More places". */
export async function openLocalFinder(page: Page, query: string): Promise<void> {
  if (isLocalFinderPage(page.url())) return;
  await gotoSettled(page, localFinderUrl(query));
  await acceptConsentIfPresent(page);
  await page.waitForTimeout(2000);
  await scrollPlacesList(page);
}

/** Fallback when udm=1 serves empty/chrome-only DOM — Maps search sidebar. */
export async function openMapsSearch(page: Page, query: string): Promise<void> {
  const target = mapsSearchUrl(query);
  if (page.url().startsWith(target.split("?")[0]!)) return;
  await gotoSettled(page, target);
  await acceptConsentIfPresent(page);
  await page.waitForTimeout(2500);
  await scrollPlacesList(page, 6);
}

async function scrollPlacesList(page: Page, iterations = 10): Promise<void> {
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

async function waitForLocalCandidates(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1500);
  await page
    .waitForSelector(
      ".Nv2PK, .VkpGBb, [role='article'], [role='heading'], .rllt__link, #rso a[href*='maps'], a[href*='/maps/place']",
      { timeout: 12_000 },
    )
    .catch(() => undefined);
}

export async function openMorePlaces(page: Page, query?: string): Promise<boolean> {
  if (query?.trim()) {
    await openLocalFinder(page, query);
    return true;
  }
  return false;
}

function realBusinessCount(candidates: LocalPackCandidate[]): number {
  return candidates.filter((c) => !/^(maps|all|images)$/i.test(c.title.trim())).length;
}

export async function findGmbInLocalPack(
  page: Page,
  input: LocalPackTarget & {
    query?: string;
    /** Sessions only: reach the listing by name when it doesn't rank. Result source is `branded_search`. */
    allowBrandedFallback?: boolean;
  },
): Promise<LocalPackResult | null> {
  await waitForLocalCandidates(page);

  let candidates = await collectLocalPackCandidates(page);
  const onSerp = matchCandidate(candidates, input, "local_pack");
  if (onSerp) return onSerp;

  if (!input.query?.trim()) {
    console.error(`[gmb] No query for local finder; SERP candidates=${candidates.length}`);
    return null;
  }

  await openLocalFinder(page, input.query);
  await waitForLocalCandidates(page);
  candidates = await collectLocalPackCandidates(page);
  let found = matchCandidate(candidates, input, "more_places");

  if (!found) {
    await scrollPlacesList(page, 8);
    candidates = await collectLocalPackCandidates(page);
    found = matchCandidate(candidates, input, "more_places");
  }

  // Places list pages ~20 businesses; ranks near 20 drift onto page 2 between sessions.
  const firstPageCount = realBusinessCount(candidates);
  if (!found && firstPageCount >= 10 && isLocalFinderPage(page.url())) {
    if (await goToNextSerpPage(page, false)) {
      await waitForLocalCandidates(page);
      await scrollPlacesList(page, 8);
      const pageTwo = await collectLocalPackCandidates(page);
      found = matchCandidate(pageTwo, input, "more_places", firstPageCount);
      console.error(`[gmb] Places page 2: candidates=${pageTwo.length} found=${found?.position ?? "no"}`);
      if (!found) candidates = pageTwo;
    } else {
      console.error(`[gmb] Places page 1 had ${firstPageCount} businesses; no page 2 link`);
    }
  }

  // udm=1 sometimes serves empty chrome ("Maps" only). Rank from a keyword-only Maps search.
  const placesListEmpty = !found && realBusinessCount(candidates) < 2;
  if (placesListEmpty) {
    console.error(
      `[gmb] udm=1 weak (candidates=${candidates.length}: ${candidates
        .map((c) => c.title)
        .slice(0, 8)
        .join(" | ")}); trying keyword Maps search`,
    );
    await openMapsSearch(page, input.query);
    await waitForLocalCandidates(page);
    // Maps feed lazy-loads ~20 at a time; keep scrolling until found or the list stops growing.
    let stalls = 0;
    for (let round = 0; round < 8 && !found && stalls < 2; round += 1) {
      const before = candidates.length;
      await scrollPlacesList(page, round === 0 ? 8 : 5);
      candidates = await collectLocalPackCandidates(page);
      found = matchCandidate(candidates, input, "maps_keyword");
      stalls = candidates.length > before ? 0 : stalls + 1;
      if (candidates.length >= 60) break;
    }
    console.error(`[gmb] Maps feed scanned ${candidates.length} businesses found=${found?.position ?? "no"}`);
  }

  if (!found && placesListEmpty && input.allowBrandedFallback) {
    console.error("[gmb] Not ranked for keyword; opening listing via branded Maps search (not a rank)");
    await openMapsSearch(page, `${input.businessName} ${input.query}`.trim());
    await waitForLocalCandidates(page);
    candidates = await collectLocalPackCandidates(page);
    found = matchCandidate(candidates, input, "branded_search");
  }

  if (!found) {
    console.error(
      `[gmb] Not found; url=${page.url()} candidates=${candidates.length}: ${candidates
        .map((c) => c.title)
        .slice(0, 15)
        .join(" | ")}`,
    );
  }
  return found;
}

export async function clickLocalPackResult(page: Page, result: LocalPackResult): Promise<void> {
  const handle = await page.evaluateHandle(
    ({ title, href, cardSelectors }): HTMLElement | null => {
      const needle = title.toLowerCase().slice(0, 24);
      const cards = Array.from(document.querySelectorAll(cardSelectors)) as HTMLElement[];

      for (const card of cards) {
        const text = (card.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!text.includes(needle)) continue;
        const anchor = card.querySelector(
          "a.hfpxzc, a[href*='/maps/place'], a[href*='/maps'], a[href]",
        ) as HTMLAnchorElement | null;
        const target = anchor ?? card;
        target.scrollIntoView({ block: "center", inline: "nearest" });
        return target;
      }

      const headings = Array.from(document.querySelectorAll('[role="heading"]')) as HTMLElement[];
      for (const heading of headings) {
        const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!text.includes(needle)) continue;
        const card = heading.closest(".Nv2PK, [role='article'], .VkpGBb, div") ?? heading;
        card.scrollIntoView({ block: "center", inline: "nearest" });
        return card as HTMLElement;
      }

      if (href) {
        const byHref = document.querySelector(`a[href="${CSS.escape(href)}"]`) as HTMLElement | null;
        if (byHref) {
          byHref.scrollIntoView({ block: "center", inline: "nearest" });
          return byHref;
        }
      }

      for (const anchor of Array.from(
        document.querySelectorAll('a[href*="/maps/place"]'),
      ) as HTMLAnchorElement[]) {
        const label = (anchor.getAttribute("aria-label") ?? anchor.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (!label.includes(needle)) continue;
        anchor.scrollIntoView({ block: "center", inline: "nearest" });
        return anchor;
      }
      return null;
    },
    { title: result.title, href: result.href, cardSelectors: CARD_SELECTORS },
  );

  const clicked = await trustedClickPicked(page, handle.asElement(), "local-pack");
  if (!clicked) {
    throw new Error(`Could not click local pack result: ${result.title}`);
  }

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1500);
}
