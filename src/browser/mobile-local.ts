import type { Page } from "./pw.js";
import { collectLocalPackCandidates, type LocalPackCandidate } from "./local-pack-collect.js";
import { matchCandidate, type LocalPackResult, type LocalPackTarget } from "./local-pack-match.js";
import { openMobileMapsList, openMobileMapsSearch, scrollMobileList } from "./mobile-local-nav.js";

export { isMobilePage } from "./mobile-local-nav.js";

/** Phone SERP local pack: three businesses linking to /searchviewer/ profiles. */
export async function collectMobilePackCandidates(page: Page): Promise<LocalPackCandidate[]> {
  return page.evaluate(() => {
    const results: Array<{ title: string; href: string; placeId: string | null; cid: string | null }> = [];
    const seen = new Set<string>();
    for (const anchor of Array.from(document.querySelectorAll("a[href*='/searchviewer/']"))) {
      const title = (anchor.querySelector("h3")?.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 2 || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      results.push({ title, href: anchor.getAttribute("href") ?? "", placeId: null, cid: null });
    }
    return results;
  });
}

/** An open Maps place page counts as one candidate; href = current URL marks it as already open. */
async function openPlaceCandidate(page: Page): Promise<LocalPackCandidate | null> {
  if (!/\/maps\/place\//i.test(page.url())) return null;
  const title = await page
    .evaluate(() => document.querySelector("[role='main'][aria-label]")?.getAttribute("aria-label") ?? "")
    .catch(() => "");
  if (title.trim().length < 2) return null;
  const placeId = page.url().match(/!1s(0x[\da-f]+:0x[\da-f]+)/i)?.[1] ?? null;
  return { title: title.trim(), href: page.url(), placeId, cid: null };
}

/** Phone flow: SERP pack, then the Maps tab's list, then (sessions only) a branded Maps search. */
export async function findGmbOnMobile(
  page: Page,
  input: LocalPackTarget & { query?: string; allowBrandedFallback?: boolean },
): Promise<LocalPackResult | null> {
  await page.waitForTimeout(1_500);
  const pack = await collectMobilePackCandidates(page);
  const onSerp = matchCandidate(pack, input, "local_pack");
  if (onSerp) return onSerp;
  if (!input.query?.trim()) {
    console.error(`[gmb] mobile: no query for Maps list; pack=${pack.length}`);
    return null;
  }

  await openMobileMapsList(page, input.query);
  let candidates = await collectLocalPackCandidates(page);
  let found = matchCandidate(candidates, input, "maps_keyword");
  let stalls = 0;
  for (let round = 0; round < 10 && !found && stalls < 2; round += 1) {
    const before = candidates.length;
    await scrollMobileList(page, 5);
    candidates = await collectLocalPackCandidates(page);
    found = matchCandidate(candidates, input, "maps_keyword");
    stalls = candidates.length > before ? 0 : stalls + 1;
    if (candidates.length >= 60) break;
  }
  console.error(
    `[gmb] mobile: pack=${pack.map((c) => c.title).join(" | ")}; Maps list scanned ${candidates.length} found=${found?.position ?? "no"}`,
  );

  if (!found && input.allowBrandedFallback) {
    console.error("[gmb] mobile: not ranked for keyword; opening listing via branded Maps search (not a rank)");
    await openMobileMapsSearch(page, `${input.businessName} ${input.query}`.trim());
    const place = await openPlaceCandidate(page);
    candidates = place ? [place] : await collectLocalPackCandidates(page);
    found = matchCandidate(candidates, input, "branded_search");
    if (!found) {
      console.error(`[gmb] mobile: branded search url=${page.url().slice(0, 120)} candidates=${candidates.map((c) => c.title).slice(0, 8).join(" | ")}`);
    }
  }
  return found;
}
