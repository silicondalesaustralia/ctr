import type { Page } from "playwright";

export interface LocalPackResult {
  position: number;
  title: string;
  href: string;
  placeId: string | null;
  cid: string | null;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(candidate: string, target: string): boolean {
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
        '[data-cat="local"], #localmap, .VkpGBb, .Nv2PK, .rllt__link, a[href*="/maps/place"], a[href*="cid="]',
      ),
    );

    for (const root of roots) {
      const anchor =
        root instanceof HTMLAnchorElement
          ? root
          : (root.querySelector("a[href]") as HTMLAnchorElement | null);
      if (!anchor?.href) continue;

      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) continue;

      const titleEl =
        root.querySelector(
          '[role="heading"], .OSrXXb, .qBF1Pd, .dbg0pd, .fontHeadlineSmall, .rllt__details div',
        ) ?? anchor;
      const title = (titleEl.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 2) continue;

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

export async function findGmbInLocalPack(
  page: Page,
  input: { businessName: string; placeId?: string | null; cid?: string | null },
): Promise<LocalPackResult | null> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  const candidates = await collectLocalPackCandidates(page);
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
      };
    }
  }

  return null;
}

export async function clickLocalPackResult(page: Page, result: LocalPackResult): Promise<void> {
  const clicked = await page.evaluate(
    ({ title, href }) => {
      const needle = title.toLowerCase().slice(0, 24);
      const anchors = Array.from(
        document.querySelectorAll(
          'a[href*="/maps"], a[href*="cid="], .VkpGBb a[href], .rllt__link, [data-cat="local"] a[href]',
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
