import type { Page } from "./pw.js";
import { randomBetween, sleep } from "../utils/helpers.js";
import { trustedClickPicked } from "./serp-trusted-click.js";

/** Result titles anywhere in the results column, including continuous-scroll batches. */
export const RESULT_TITLE_SELECTOR = "#center_col a[href]:has(h3)";

async function countResultTitles(page: Page): Promise<number> {
  return page.evaluate((selector) => document.querySelectorAll(selector).length, RESULT_TITLE_SELECTOR);
}

/**
 * Classic pager: Google's `a#pnnext` (or "Next page"). A text match on "Next" can
 * hit hidden or unrelated anchors first, so only real pager links are used.
 */
async function clickPagerNext(page: Page): Promise<boolean | null> {
  const serpUrl = page.url();
  const pick = await page.evaluateHandle((): HTMLAnchorElement | null => {
    const anchors = Array.from(
      document.querySelectorAll("a#pnnext, a[aria-label='Next page']"),
    ) as HTMLAnchorElement[];
    const next = anchors.find((a) => (a.getAttribute("href") ?? "").includes("start=")) ?? null;
    if (next) next.scrollIntoView({ block: "center", inline: "nearest" });
    return next;
  });
  const anchor = pick.asElement();
  if (!anchor) {
    await pick.dispose();
    return null;
  }

  const href = await anchor.getAttribute("href");
  const clickedVia = await trustedClickPicked(page, anchor, "serp-next");
  let moved = await page
    .waitForURL((url) => url.href !== serpUrl, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!moved && href) {
    console.error(`[serp] next-page click did not navigate (${clickedVia ?? "no click"}); loading href`);
    moved = await page
      .goto(new URL(href, serpUrl).toString(), { waitUntil: "domcontentloaded", timeout: 30_000 })
      .then(() => true)
      .catch((error: unknown) => {
        console.error(`[serp] next-page load failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      });
  }
  return moved;
}

async function pagerPresent(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelector("a#pnnext[href*='start='], a[aria-label='Next page'][href*='start=']") !== null,
  );
}

/**
 * Scroll down like a reader. Google renders the pager only once the footer nears
 * the viewport; continuous-scroll layouts append another batch instead.
 */
async function scrollForMore(page: Page): Promise<"pager" | "batch" | null> {
  const before = await countResultTitles(page);
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    const scrollY = await page.evaluate(() => window.scrollY);
    const step = randomBetween(700, 1_200);
    await page.mouse.wheel(0, step);
    await sleep(randomBetween(600, 1_300));
    if ((await page.evaluate(() => window.scrollY)) === scrollY) {
      // Wheel over a carousel/map scrolls that element, not the document.
      await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: "smooth" }), step);
      await sleep(randomBetween(400, 800));
    }
    if (await pagerPresent(page)) return "pager";

    const atBottom = await page.evaluate(
      () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 400,
    );
    if (atBottom) {
      const more = await page.evaluateHandle((): HTMLElement | null => {
        const buttons = Array.from(document.querySelectorAll("a, button, [role='button']")) as HTMLElement[];
        const hit = buttons.find((el) => {
          const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`.trim();
          const rect = el.getBoundingClientRect();
          return /^more (search )?results$/i.test(label) && rect.width > 0 && rect.height > 0;
        });
        return hit ?? null;
      });
      await trustedClickPicked(page, more.asElement(), "serp-more");
      await sleep(randomBetween(1_500, 2_500));
    }

    if ((await countResultTitles(page)) > before) {
      await sleep(randomBetween(800, 1_500));
      return "batch";
    }
  }
  console.error(`[serp] no pager or new results after scrolling (titles=${before})`);
  return null;
}

async function settleAfterPaging(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(2000);
}

/** Pager never rendered: request the same `start=` URL the Next link would point to. */
async function loadNextByUrl(page: Page): Promise<boolean> {
  // Shopping-heavy SERPs can show only a few organic titles on a non-final page.
  if ((await countResultTitles(page)) === 0) return false;
  const current = new URL(page.url());
  if (!current.searchParams.get("q")) return false;
  const next = new URL(current.toString());
  next.searchParams.set("start", String(Number(current.searchParams.get("start") ?? "0") + 10));
  console.error(`[serp] pager missing; loading start=${next.searchParams.get("start")}`);
  try {
    await page.goto(next.toString(), { waitUntil: "domcontentloaded", timeout: 30_000, referer: current.toString() });
    await settleAfterPaging(page);
    return true;
  } catch (error: unknown) {
    console.error(`[serp] direct next-page load failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** Advance to the next batch of results: pager click when present, otherwise scroll-load. */
export async function goToNextSerpPage(page: Page): Promise<boolean> {
  const immediate = await clickPagerNext(page);
  if (immediate !== null) {
    if (immediate) await settleAfterPaging(page);
    return immediate;
  }

  const found = await scrollForMore(page);
  if (found === "batch") return true;
  if (found !== "pager") return loadNextByUrl(page);

  const paged = await clickPagerNext(page);
  if (paged) await settleAfterPaging(page);
  return paged === true;
}
