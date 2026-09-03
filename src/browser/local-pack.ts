import type { Page } from "playwright";
import { acceptConsentIfPresent } from "./blocked-detection.js";
import {
  CARD_SELECTORS,
  collectLocalPackCandidates,
  mapsSearchUrl,
  type LocalPackCandidate,
} from "./local-pack-collect.js";

export type LocalPackSource = "local_pack" | "more_places";
export type { LocalPackCandidate };
export { collectLocalPackCandidates, mapsSearchUrl };

export interface LocalPackResult {
  position: number;
  title: string;
  href: string;
  placeId: string | null;
  cid: string | null;
  source: LocalPackSource;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(candidate: string, target: string): boolean {
  const a = normalizeName(candidate);
  const b = normalizeName(target);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

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

function matchCandidate(
  candidates: LocalPackCandidate[],
  input: { businessName: string; placeId?: string | null; cid?: string | null },
  source: LocalPackSource,
): LocalPackResult | null {
  const rawId = input.placeId?.trim() ?? "";
  const cidFromId = rawId.toLowerCase().startsWith("cid:")
    ? rawId.slice(4)
    : /^\d{6,}$/.test(rawId)
      ? rawId
      : null;
  const placeId =
    rawId && !rawId.toLowerCase().startsWith("cid:") && !/^\d{6,}$/.test(rawId) ? rawId : null;
  const cid = (input.cid ?? cidFromId)?.replace(/^cid:/i, "") ?? null;

  let position = 0;
  for (const candidate of candidates) {
    position += 1;
    const idMatch =
      (placeId && candidate.placeId && candidate.placeId === placeId) ||
      (cid && candidate.cid && candidate.cid === cid);
    if (idMatch || namesMatch(candidate.title, input.businessName)) {
      return {
        position,
        title: candidate.title,
        href: candidate.href,
        placeId: candidate.placeId,
        cid: candidate.cid,
        source,
      };
    }
  }
  return null;
}

async function scrollPlacesList(page: Page, iterations = 10): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    await page.evaluate(() => {
      const feed =
        document.querySelector("[role='feed']") ??
        document.querySelector("#search") ??
        document.scrollingElement;
      if (feed) feed.scrollBy(0, 700);
      else window.scrollBy(0, 700);
    });
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
  input: {
    businessName: string;
    placeId?: string | null;
    cid?: string | null;
    query?: string;
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

  // Mobile often serves empty udm=1 chrome ("Maps" only). Fall back to Maps search.
  if (!found && realBusinessCount(candidates) < 2) {
    const mapsQuery = `${input.businessName} ${input.query}`.trim();
    console.error(
      `[gmb] udm=1 weak (candidates=${candidates.length}: ${candidates
        .map((c) => c.title)
        .slice(0, 8)
        .join(" | ")}); trying Maps search`,
    );
    await openMapsSearch(page, mapsQuery);
    await waitForLocalCandidates(page);
    candidates = await collectLocalPackCandidates(page);
    found = matchCandidate(candidates, input, "more_places");

    if (!found) {
      await openMapsSearch(page, input.query);
      await waitForLocalCandidates(page);
      await scrollPlacesList(page, 8);
      candidates = await collectLocalPackCandidates(page);
      found = matchCandidate(candidates, input, "more_places");
    }
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
  const clicked = await page.evaluate(
    ({ title, href, cardSelectors }) => {
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
        target.click();
        return true;
      }

      const headings = Array.from(document.querySelectorAll('[role="heading"]')) as HTMLElement[];
      for (const heading of headings) {
        const text = (heading.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!text.includes(needle)) continue;
        const card = heading.closest(".Nv2PK, [role='article'], .VkpGBb, div") ?? heading;
        card.scrollIntoView({ block: "center", inline: "nearest" });
        (card as HTMLElement).click();
        return true;
      }

      if (href) {
        const byHref = document.querySelector(`a[href="${CSS.escape(href)}"]`) as HTMLElement | null;
        if (byHref) {
          byHref.click();
          return true;
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
        anchor.click();
        return true;
      }
      return false;
    },
    { title: result.title, href: result.href, cardSelectors: CARD_SELECTORS },
  );

  if (!clicked) {
    throw new Error(`Could not click local pack result: ${result.title}`);
  }

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1500);
}
