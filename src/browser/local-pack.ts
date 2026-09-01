import type { Page } from "playwright";

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

/** Places cards are often clickable divs; title headings matter more than href. */
async function collectLocalPackCandidates(page: Page): Promise<LocalPackCandidate[]> {
  return page.evaluate(() => {
    const results: Array<{
      title: string;
      href: string;
      placeId: string | null;
      cid: string | null;
    }> = [];
    const seen = new Set<string>();

    const cardSelector = [
      ".Nv2PK",
      ".VkpGBb",
      ".rllt__link",
      ".cXedhc",
      "[data-cat='local']",
      ".section-result",
      "div[jscontroller][data-record-click-time]",
      "[role='feed'] > div",
      "[role='list'] > div",
    ].join(", ");

    const cards = Array.from(document.querySelectorAll(cardSelector));

    for (const card of cards) {
      const heading =
        card.querySelector(
          '[role="heading"], .OSrXXb, .qBF1Pd, .dbg0pd, .fontHeadlineSmall, .fontTitleLarge, .qLueuc',
        ) ?? null;
      let title = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 2) {
        const aria = card.getAttribute("aria-label") ?? "";
        title = aria.split(/[·•|]/)[0]?.replace(/\s+/g, " ").trim() ?? "";
      }
      if (title.length < 2) continue;
      if (/^(directions|website|call|more places|see more|share|save)$/i.test(title)) continue;
      // Avoid grabbing entire card blobs
      if (title.length > 120) {
        title = title.slice(0, 80).trim();
      }

      const anchor = card.querySelector(
        'a[href*="/maps"], a[href*="cid="], a[href*="place"], a[href*="query_place_id="], a[href]',
      ) as HTMLAnchorElement | null;
      const href = anchor?.getAttribute("href") ?? "";

      const blob = `${href} ${card.outerHTML.slice(0, 4000)}`;
      const placeIdMatch = blob.match(/query_place_id=([^&"']+)|(ChIJ[\w-]+)/);
      const cidMatch = blob.match(
        /[?&"'\s]cid[=:](\d{6,})|ludocid[=:](\d{6,})|data-cid[=:]["']?(\d{6,})|!1s0x[\da-f]+:0x([\da-f]+)/i,
      );
      let cid = cidMatch?.[1] ?? cidMatch?.[2] ?? cidMatch?.[3] ?? null;
      if (!cid && cidMatch?.[4]) {
        // hex feature id → decimal string Google often uses as CID
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

    // Fallback: any maps/place anchors with readable text
    if (results.length === 0) {
      for (const anchor of Array.from(
        document.querySelectorAll('a[href*="/maps/place"], a[href*="cid="]'),
      ) as HTMLAnchorElement[]) {
        const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
        if (title.length < 2 || title.length > 120) continue;
        const href = anchor.getAttribute("href") ?? "";
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ title, href, placeId: null, cid: null });
      }
    }

    return results;
  });
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

async function scrollPlacesList(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await page.evaluate(() => {
      const feed =
        document.querySelector("[role='feed']") ??
        document.querySelector("#search") ??
        document.scrollingElement;
      if (feed) feed.scrollBy(0, 600);
      else window.scrollBy(0, 600);
    });
    await page.waitForTimeout(400);
  }
}

export async function openMorePlaces(page: Page, query?: string): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const needles = ["more places", "see more", "more businesses", "view all", "places"];
    const nodes = Array.from(
      document.querySelectorAll("a, button, span, div[role='button'], g-more-link a"),
    ) as HTMLElement[];

    for (const el of nodes) {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!needles.some((needle) => text === needle || text.startsWith(needle))) continue;
      if (text.length > 48) continue;
      // Prefer exact-ish "More places"
      if (text.includes("map") && !text.includes("place")) continue;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        continue;
      }
      el.scrollIntoView({ block: "center", inline: "nearest" });
      el.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(2500);
    await page
      .waitForSelector(
        ".Nv2PK, .VkpGBb, [role='feed'], [role='heading'], a[href*='/maps/place']",
        { timeout: 8_000 },
      )
      .catch(() => undefined);
    await scrollPlacesList(page);
    return true;
  }

  // Fallback: Google local results tab (same Places list UI)
  if (query?.trim()) {
    const url = `https://www.google.com.au/search?tbm=lcl&hl=en-AU&gl=au&q=${encodeURIComponent(query.trim())}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    await scrollPlacesList(page);
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
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  let candidates = await collectLocalPackCandidates(page);
  const onSerp = matchCandidate(candidates, input, "local_pack");
  if (onSerp) return onSerp;

  const opened = await openMorePlaces(page, input.query);
  if (!opened) {
    console.error(
      `[gmb] More places not opened; SERP candidates=${candidates.length}: ${candidates
        .map((c) => c.title)
        .slice(0, 8)
        .join(" | ")}`,
    );
    return null;
  }

  candidates = await collectLocalPackCandidates(page);
  const found = matchCandidate(candidates, input, "more_places");
  if (!found) {
    console.error(
      `[gmb] Not in Places list; candidates=${candidates.length}: ${candidates
        .map((c) => c.title)
        .slice(0, 12)
        .join(" | ")}`,
    );
  }
  return found;
}

export async function clickLocalPackResult(page: Page, result: LocalPackResult): Promise<void> {
  const clicked = await page.evaluate(
    ({ title, href }) => {
      const needle = title.toLowerCase().slice(0, 24);
      const cards = Array.from(
        document.querySelectorAll(
          ".Nv2PK, .VkpGBb, .rllt__link, [role='feed'] > div, [data-cat='local']",
        ),
      ) as HTMLElement[];

      for (const card of cards) {
        const text = (card.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        if (!text.includes(needle)) continue;
        const anchor = card.querySelector("a[href]") as HTMLAnchorElement | null;
        const target = anchor ?? card;
        target.scrollIntoView({ block: "center", inline: "nearest" });
        target.click();
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
    { title: result.title, href: result.href },
  );

  if (!clicked) {
    throw new Error(`Could not click local pack result: ${result.title}`);
  }

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1500);
}
