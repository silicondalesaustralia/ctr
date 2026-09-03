import type { Page } from "playwright";

export interface LocalPackCandidate {
  title: string;
  href: string;
  placeId: string | null;
  cid: string | null;
}

export const CARD_SELECTORS =
  ".Nv2PK, [role='article'], .VkpGBb, .rllt__link, [data-cat='local'], .cXedhc, .section-result, .uMdZh, .UaQhfb, .lI9IFe";

export const TITLE_SELECTORS =
  '[role="heading"], .OSrXXb, .qBF1Pd, .dbg0pd, .fontHeadlineSmall, .fontHeadlineLarge, .fontTitleLarge, .qLueuc, .fontHeadline, .fontTitleMedium';

/** Chrome/nav labels that are not business names. */
export const UI_TITLE =
  /^(directions|website|call|more places|see more|share|save|collapse|results|maps|all|images|news|videos|shopping|books|flights|finance|short videos|places|search|filters|sort|overview|menu|about|hours|photos)$/i;

export function mapsSearchUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://www.google.com.au/maps/search/${q}?hl=en-AU`;
}

export async function collectLocalPackCandidates(page: Page): Promise<LocalPackCandidate[]> {
  const url = page.url();
  const isLocalFinder = /[?&]udm=1/i.test(url);
  const isMapsHost = /google\.[^/]*\/maps/i.test(url);

  if (isMapsHost) {
    const fromMaps = await collectMapsPlaceCandidates(page);
    if (fromMaps.length > 0) return fromMaps;
  }

  const modern = await collectModernLocalCandidates(page, isLocalFinder || isMapsHost);
  if (modern.length > 0) return modern;

  const headings = await collectHeadingCandidates(page, isLocalFinder || isMapsHost);
  if (headings.length > 0) return headings;

  return collectBasicHtmlCandidates(page);
}

async function collectMapsPlaceCandidates(page: Page): Promise<LocalPackCandidate[]> {
  return page.evaluate((uiTitlePattern) => {
    const results: Array<{
      title: string;
      href: string;
      placeId: string | null;
      cid: string | null;
    }> = [];
    const seen = new Set<string>();
    const uiTitle = new RegExp(uiTitlePattern, "i");

    const anchors = Array.from(
      document.querySelectorAll(
        'a[href*="/maps/place"], a[href*="/maps/place/"], a[data-result-index], [role="feed"] a[href*="maps"]',
      ),
    ) as HTMLAnchorElement[];

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") ?? "";
      let title =
        (anchor.getAttribute("aria-label") ?? "").split(/[·•|,]/)[0]?.replace(/\s+/g, " ").trim() ??
        "";
      if (title.length < 3) {
        const heading = anchor.querySelector('[role="heading"], .fontHeadlineSmall, .qBF1Pd');
        title = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();
      }
      if (title.length < 3) {
        title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      }
      if (title.length < 3 || title.length > 120 || uiTitle.test(title)) continue;

      const blob = `${href} ${anchor.outerHTML.slice(0, 4000)}`;
      const placeIdMatch = blob.match(/query_place_id=([^&"']+)|(ChIJ[\w-]+)|!1s(0x[\da-f]+:0x[\da-f]+)/i);
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
          const link = card.querySelector(
            "a.hfpxzc, a[href*='/maps/place'], a[href*='/maps']",
          ) as HTMLAnchorElement | null;
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
          "a.hfpxzc, a[href*='/maps/place'], a[href*='/maps'], a[href*='cid='], a[href*='place'], a[href*='query_place_id='], a[href]",
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
        "a.hfpxzc, a[href*='/maps/place'], a[href*='/maps'], a[href*='cid='], a[href*='place'], a[href*='query_place_id=']",
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
      if (!/maps\/place|cid=|query_place_id|!1s0x/i.test(href) && !/\/maps\//i.test(href)) {
        continue;
      }

      let title =
        (anchor.getAttribute("aria-label") ?? "").split(/[·•|,]/)[0]?.replace(/\s+/g, " ").trim() ??
        "";
      if (title.length < 3) {
        title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
      }
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
