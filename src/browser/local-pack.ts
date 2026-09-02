import type { Page } from "playwright";
import { acceptConsentIfPresent } from "./blocked-detection.js";

export type LocalPackSource = "local_pack" | "more_places";

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

interface LocalPackCandidate {
  title: string;
  href: string;
  placeId: string | null;
  cid: string | null;
}

const CARD_SELECTORS =
  ".Nv2PK, [role='article'], .VkpGBb, .rllt__link, [data-cat='local'], .cXedhc, .section-result, .uMdZh";

const TITLE_SELECTORS =
  '[role="heading"], .OSrXXb, .qBF1Pd, .dbg0pd, .fontHeadlineSmall, .fontHeadlineLarge, .fontTitleLarge, .qLueuc, .fontHeadline';

const UI_TITLE = /^(directions|website|call|more places|see more|share|save|collapse|results)$/i;

export function localFinderUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://www.google.com.au/search?q=${q}&udm=1&hl=en-AU&gl=au`;
}

export function isLocalFinderPage(url: string): boolean {
  return /[?&]udm=1/i.test(url);
}

/** Open Google's local Places list (`udm=1`) — same view as "More places". */
export async function openLocalFinder(page: Page, query: string): Promise<void> {
  if (isLocalFinderPage(page.url())) return;

  await page.goto(localFinderUrl(query), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await acceptConsentIfPresent(page);
  await page.waitForTimeout(2000);
  await scrollPlacesList(page);
}

/** Places cards are often clickable divs; title headings matter more than href. */
export async function collectLocalPackCandidates(page: Page): Promise<LocalPackCandidate[]> {
  const url = page.url();
  const isLocalFinder = /[?&]udm=1/i.test(url);
  const modern = await collectModernLocalCandidates(page, isLocalFinder);
  if (modern.length > 0) return modern;

  const headings = await collectHeadingCandidates(page, isLocalFinder);
  if (headings.length > 0) return headings;

  return collectBasicHtmlCandidates(page);
}

async function collectModernLocalCandidates(
  page: Page,
  isLocalFinder: boolean,
): Promise<LocalPackCandidate[]> {
  return page.evaluate(
    ({ cardSelectors, titleSelectors, uiTitlePattern, isLocalFinder }) => {
      const results: Array<{
        title: string;
        href: string;
        placeId: string | null;
        cid: string | null;
      }> = [];
      const seen = new Set<string>();
      const uiTitle = new RegExp(uiTitlePattern, "i");

      const cards = Array.from(document.querySelectorAll(cardSelectors));
      for (const card of cards) {
        const heading = card.querySelector(titleSelectors);
        let title = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();
        if (title.length < 2) {
          const aria = card.getAttribute("aria-label") ?? "";
          title = aria.split(/[·•|]/)[0]?.replace(/\s+/g, " ").trim() ?? "";
        }
        if (title.length < 2) {
          const link = card.querySelector("a.hfpxzc, a[href*='/maps']") as HTMLAnchorElement | null;
          const linkAria = link?.getAttribute("aria-label") ?? "";
          title = linkAria.split(/[·•|]/)[0]?.replace(/\s+/g, " ").trim() ?? "";
        }
        if (title.length < 2) continue;
        if (uiTitle.test(title)) continue;
        if (title.length > 120) title = title.slice(0, 80).trim();

        const cardText = (card.textContent ?? "").replace(/\s+/g, " ");
        const looksLikeBusiness =
          isLocalFinder ||
          (title.length >= 3 &&
            (/\d\.\d/.test(cardText) ||
              /\(\d+\)/.test(cardText) ||
              /website|directions|open|closed|plumber|gas|·/i.test(cardText) ||
              card.matches(".Nv2PK, [role='article'], .VkpGBb")));
        if (!looksLikeBusiness) continue;

        const anchor = card.querySelector(
          "a.hfpxzc, a[href*='/maps'], a[href*='cid='], a[href*='place'], a[href*='query_place_id='], a[href]",
        ) as HTMLAnchorElement | null;
        const href = anchor?.getAttribute("href") ?? "";

        const blob = `${href} ${card.outerHTML.slice(0, 5000)}`;
        const placeIdMatch = blob.match(/query_place_id=([^&"']+)|(ChIJ[\w-]+)/);
        const cidMatch = blob.match(
          /[?&"'\s]cid[=:](\d{6,})|ludocid[=:](\d{6,})|data-cid[=:]["']?(\d{6,})|!1s0x[\da-f]+:0x([\da-f]+)/i,
        );
        let cid = cidMatch?.[1] ?? cidMatch?.[2] ?? cidMatch?.[3] ?? null;
        if (!cid && cidMatch?.[4]) {
          try {
            cid = BigInt(`0x${cidMatch[4]}`).toString();
          } catch {
            cid = null;
          }
        }

        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          title,
          href,
          placeId: placeIdMatch?.[1] ?? placeIdMatch?.[2] ?? null,
          cid,
        });
      }

      return results;
    },
    {
      cardSelectors: CARD_SELECTORS,
      titleSelectors: TITLE_SELECTORS,
      uiTitlePattern: UI_TITLE.source,
      isLocalFinder,
    },
  );
}

async function collectHeadingCandidates(
  page: Page,
  isLocalFinder: boolean,
): Promise<LocalPackCandidate[]> {
  if (!isLocalFinder) return [];

  return page.evaluate((uiTitlePattern) => {
    const results: Array<{
      title: string;
      href: string;
      placeId: string | null;
      cid: string | null;
    }> = [];
    const seen = new Set<string>();
    const uiTitle = new RegExp(uiTitlePattern, "i");
    const root = document.querySelector("#rso") ?? document.querySelector("#search") ?? document.body;

    for (const heading of Array.from(root.querySelectorAll('[role="heading"]'))) {
      let title = (heading.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 3 || title.length > 120 || uiTitle.test(title)) continue;

      const card =
        heading.closest(".Nv2PK, [role='article'], .VkpGBb, [data-cid], [jsaction]") ??
        heading.parentElement;
      if (!card) continue;

      const anchor = card.querySelector(
        "a.hfpxzc, a[href*='/maps'], a[href*='cid='], a[href*='place'], a[href*='query_place_id=']",
      ) as HTMLAnchorElement | null;
      const href = anchor?.getAttribute("href") ?? "";
      const blob = `${href} ${card.outerHTML.slice(0, 5000)}`;
      const placeIdMatch = blob.match(/query_place_id=([^&"']+)|(ChIJ[\w-]+)/);
      const cidMatch = blob.match(/[?&]cid=(\d{6,})/i);

      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        title,
        href,
        placeId: placeIdMatch?.[1] ?? placeIdMatch?.[2] ?? null,
        cid: cidMatch?.[1] ?? null,
      });
    }

    return results;
  }, UI_TITLE.source);
}

async function collectBasicHtmlCandidates(page: Page): Promise<LocalPackCandidate[]> {
  return page.evaluate((uiTitlePattern) => {
    const results: Array<{
      title: string;
      href: string;
      placeId: string | null;
      cid: string | null;
    }> = [];
    const seen = new Set<string>();
    const uiTitle = new RegExp(uiTitlePattern, "i");

    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      const href = anchor.getAttribute("href") ?? "";
      if (!/maps|cid=|place|query_place_id/i.test(href)) continue;

      let title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 3) {
        const parent = anchor.closest("div, li, td");
        title = (parent?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      }
      if (title.length < 3 || title.length > 120 || uiTitle.test(title)) continue;

      const blob = `${href} ${anchor.outerHTML}`;
      const placeIdMatch = blob.match(/query_place_id=([^&"']+)|(ChIJ[\w-]+)/);
      const cidMatch = blob.match(/[?&]cid=(\d{6,})/i);

      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        title,
        href,
        placeId: placeIdMatch?.[1] ?? placeIdMatch?.[2] ?? null,
        cid: cidMatch?.[1] ?? null,
      });
    }

    return results;
  }, UI_TITLE.source);
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
      ".Nv2PK, .VkpGBb, [role='article'], [role='heading'], .rllt__link, #rso a[href*='maps']",
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

  if (!found) {
    console.error(
      `[gmb] Not in Places list (udm=1); candidates=${candidates.length}: ${candidates
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
          "a.hfpxzc, a[href*='/maps'], a[href]",
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
