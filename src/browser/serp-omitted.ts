import type { Page } from "./pw.js";
import { randomBetween, sleep } from "../utils/helpers.js";
import { trustedClickPicked } from "./serp-trusted-click.js";

/**
 * Google's "we have omitted some entries very similar to the N already displayed" notice
 * truncates the SERP (often to ~4 organics with no real page 2). Clicking its
 * "repeat the search with the omitted results included" link reloads with `filter=0`.
 * Returns true when the unfiltered SERP loaded.
 */
export async function expandOmittedResults(page: Page): Promise<boolean> {
  const serpUrl = page.url();
  if (new URL(serpUrl).searchParams.get("filter") === "0") return false;

  const pick = await page.evaluateHandle((): HTMLAnchorElement | null => {
    const link = document.querySelector("#ofr a[href*='filter=0']") as HTMLAnchorElement | null;
    return link && (link.textContent ?? "").trim().length > 0 ? link : null;
  });
  const anchor = pick.asElement();
  if (!anchor) {
    await pick.dispose();
    return false;
  }

  const href = await anchor.getAttribute("href");
  await sleep(randomBetween(800, 2_000));
  const clickedVia = await trustedClickPicked(page, anchor, "serp-omitted");
  let moved = await page
    .waitForURL((url) => url.href !== serpUrl, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!moved && href) {
    console.error(`[serp] omitted-results click did not navigate (${clickedVia ?? "no click"}); loading href`);
    moved = await page
      .goto(new URL(href, serpUrl).toString(), { waitUntil: "domcontentloaded", timeout: 30_000, referer: serpUrl })
      .then(() => true)
      .catch((error: unknown) => {
        console.error(`[serp] omitted-results load failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      });
  }
  if (!moved) return false;

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await sleep(randomBetween(1_500, 2_500));
  console.error("[serp] reloaded with omitted results included (filter=0)");
  return true;
}
