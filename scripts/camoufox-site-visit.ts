/**
 * Human-ish SERP → site visit for the Camoufox control script: skim results,
 * click an organic result, scroll, then follow a couple of internal links.
 */
import type { Locator, Page } from "playwright-core";
import { randomBetween, sleep } from "../src/utils/helpers.js";

export interface SiteVisitResult {
  landingUrl: string | null;
  pagesVisited: string[];
}

async function readingScroll(page: Page, steps: [number, number]): Promise<void> {
  const count = randomBetween(steps[0], steps[1]);
  for (let i = 0; i < count; i += 1) {
    await page.mouse.wheel(0, randomBetween(250, 650));
    await sleep(randomBetween(1_200, 3_500));
  }
  if (Math.random() < 0.35) {
    await page.mouse.wheel(0, -randomBetween(200, 500));
    await sleep(randomBetween(800, 2_000));
  }
}

async function humanClick(page: Page, link: Locator): Promise<void> {
  const title = link.locator("h3");
  const target = (await title.count()) > 0 ? title.first() : link;
  await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(randomBetween(900, 1_800));
  await target.hover({ timeout: 5_000 }).catch(() => undefined);
  await sleep(randomBetween(400, 1_200));
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined),
    target.click({ timeout: 10_000 }),
  ]);
  await sleep(randomBetween(1_500, 3_000));
}

async function organicResults(page: Page): Promise<Locator[]> {
  const links = await page.locator("#search a:has(h3)").all();
  const usable: Locator[] = [];
  for (const link of links) {
    const href = (await link.getAttribute("href")) ?? "";
    const external = href.startsWith("http") && !/google\./i.test(href);
    const redirect = /^\/(goto|url)\?/i.test(href);
    if ((external || redirect) && (await link.isVisible())) {
      usable.push(link);
    }
  }
  return usable.slice(0, 6);
}

async function internalLinks(page: Page): Promise<Locator[]> {
  const host = new URL(page.url()).hostname;
  const links = await page.locator("main a[href], article a[href], body a[href]").all();
  const usable: Locator[] = [];
  for (const link of links.slice(0, 200)) {
    const href = (await link.getAttribute("href")) ?? "";
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    if (/login|sign-?in|cart|account|subscribe/i.test(href)) continue;
    const url = new URL(href, page.url());
    if (url.hostname !== host || url.pathname === new URL(page.url()).pathname) continue;
    if (await link.isVisible()) usable.push(link);
    if (usable.length >= 25) break;
  }
  return usable;
}

export async function visitResultAndBrowse(page: Page): Promise<SiteVisitResult> {
  const visited: string[] = [];
  await readingScroll(page, [2, 4]);

  const results = await organicResults(page);
  const pick = results[randomBetween(0, Math.min(results.length, 4) - 1)];
  if (!pick) {
    console.log("No organic result found to click");
    return { landingUrl: null, pagesVisited: visited };
  }
  console.log(`Clicking result: ${(await pick.innerText()).split("\n")[0]}`);
  await humanClick(page, pick);
  const landingUrl = page.url();
  visited.push(landingUrl);
  console.log(`Landed on ${landingUrl}`);
  await readingScroll(page, [3, 6]);

  const hops = randomBetween(1, 2);
  for (let i = 0; i < hops; i += 1) {
    try {
      const links = await internalLinks(page);
      const next = links[randomBetween(0, links.length - 1)];
      if (!next) break;
      console.log(`Following internal link: ${(await next.innerText()).trim().slice(0, 60) || "(no text)"}`);
      await humanClick(page, next);
      visited.push(page.url());
      console.log(`Now on ${page.url()}`);
      await readingScroll(page, [2, 5]);
    } catch (error) {
      console.error(`Internal navigation failed: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  return { landingUrl, pagesVisited: visited };
}
