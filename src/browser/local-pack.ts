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

async function collectLocalPackCandidates(page: Page): Promise<LocalPackCandidate[]> {
  return page.evaluate(() => {
    const results: Array<{
      title: string;
      href: string;
      placeId: string | null;
      cid: string | null;
    }> = [];
    const seen = new Set<string>();

    const roots = Array.from(
      document.querySelectorAll(
        [
          '[data-cat="local"]',
          "#localmap",
          ".VkpGBb",
          ".Nv2PK",
          ".rllt__link",
          ".cXedhc",
          ".VkpGBb",
          'div[jscontroller] a[href*="/maps/place"]',
          'a[href*="/maps/place"]',
          'a[href*="cid="]',
          'a[href*="query_place_id="]',
          '[role="feed"] a[href]',
          ".section-result",
        ].join(", "),
      ),
    );

    for (const root of roots) {
      const anchor =
        root instanceof HTMLAnchorElement
          ? root
          : (root.querySelector("a[href]") as HTMLAnchorElement | null);
      if (!anchor?.href) continue;

      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || /google\.[^/]+\/search\?/i.test(href)) continue;

      const titleEl =
        root.querySelector(
          '[role="heading"], .OSrXXb, .qBF1Pd, .dbg0pd, .fontHeadlineSmall, .rllt__details div, .qLueuc, .fontTitleLarge',
        ) ?? anchor;
      let title = (titleEl.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 2) {
        title = (anchor.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
      }
      if (title.length < 2) continue;
      // Skip chrome like "Directions", "Website", "More places"
      if (/^(directions|website|call|more places|see more)$/i.test(title)) continue;

      const key = `${title.toLowerCase()}|${href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const placeIdMatch = href.match(/query_place_id=([^&]+)|(ChIJ[\w-]+)/);
      const cidMatch = href.match(/[?&]cid=(\d+)/i);
      results.push({
        title,
        href,
        placeId: placeIdMatch?.[1] ?? placeIdMatch?.[2] ?? null,
        cid: cidMatch?.[1] ?? null,
      });
    }

    return results;
  });
}

function matchCandidate(
  candidates: LocalPackCandidate[],
  input: { businessName: string; placeId?: string | null; cid?: string | null },
  source: LocalPackSource,
): LocalPackResult | null {
  const placeId = input.placeId?.replace(/^cid:/, "") ?? null;
  const cid = input.cid ?? (input.placeId?.startsWith("cid:") ? input.placeId.slice(4) : null);

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

/** Open the Places list behind local pack (More places / local results). */
export async function openMorePlaces(page: Page): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    const needles = ["more places", "see more", "more businesses", "view all"];
    const nodes = Array.from(
      document.querySelectorAll("a, button, span, div[role='button'], g-more-link a"),
    ) as HTMLElement[];

    for (const el of nodes) {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!needles.some((needle) => text === needle || text.includes(needle))) continue;
      if (text.length > 40) continue;
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

  if (!clicked) return false;

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(2500);
  // Places list often paints after a short delay
  await page
    .waitForSelector('.Nv2PK, .VkpGBb, [role="feed"] a[href], a[href*="/maps/place"]', {
      timeout: 8_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(1000);
  return true;
}

export async function findGmbInLocalPack(
  page: Page,
  input: { businessName: string; placeId?: string | null; cid?: string | null },
): Promise<LocalPackResult | null> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);

  const onSerp = matchCandidate(await collectLocalPackCandidates(page), input, "local_pack");
  if (onSerp) return onSerp;

  const opened = await openMorePlaces(page);
  if (!opened) return null;

  return matchCandidate(await collectLocalPackCandidates(page), input, "more_places");
}

export async function clickLocalPackResult(page: Page, result: LocalPackResult): Promise<void> {
  const clicked = await page.evaluate(
    ({ title, href }) => {
      const needle = title.toLowerCase().slice(0, 24);
      const anchors = Array.from(
        document.querySelectorAll(
          'a[href*="/maps"], a[href*="cid="], .VkpGBb a[href], .Nv2PK a[href], .rllt__link, [data-cat="local"] a[href], [role="feed"] a[href]',
        ),
      ) as HTMLAnchorElement[];

      for (const el of anchors) {
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
        const matchHref = el.getAttribute("href") === href;
        const matchTitle = needle.length >= 4 && text.includes(needle);
        if (!matchHref && !matchTitle) continue;
        el.scrollIntoView({ block: "center", inline: "nearest" });
        el.click();
        return true;
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
