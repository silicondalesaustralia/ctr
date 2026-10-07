import type { ElementHandle, Page } from "./pw.js";
import { randomBetween } from "../utils/helpers.js";

/** `#main` covers the Firefox-for-Android SERP, which has no #rso / #search / #center_col. */
export const SERP_ANCHOR_SELECTOR =
  "#center_col a[href], #search a[href], #rso a[href], div.MjjYud a[href], #main a[href]";

interface HitCheck {
  hit: boolean;
  top: string;
}

/** True when the topmost element at (x, y) belongs to the target's link (no overlay on top). */
async function pointHitsTarget(
  handle: ElementHandle<Element>,
  x: number,
  y: number,
): Promise<HitCheck> {
  return handle.evaluate(
    (el, point) => {
      const top = document.elementFromPoint(point.x, point.y);
      const link = el.closest("a") ?? el;
      const hit = !!top && (link.contains(top) || top.contains(link));
      const label = top ? `${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)}` : "none";
      return { hit, top: label };
    },
    { x, y },
  );
}

/**
 * Real (trusted) mouse move + click at a point inside the element, after checking no
 * overlay (e.g. Google's sticky header) sits on top. Falls back to a native link click.
 */
export async function trustedClick(
  page: Page,
  handle: ElementHandle<Element>,
  via: string,
): Promise<string> {
  try {
    await handle.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
    await page.waitForTimeout(randomBetween(400, 1100));
    const box = await handle.boundingBox();
    if (!box) throw new Error("target has no bounding box");

    const x = box.x + box.width * (0.15 + Math.random() * 0.45);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);
    const check = await pointHitsTarget(handle, x, y);
    if (!check.hit) throw new Error(`point covered by ${check.top}`);

    await page.mouse.move(x, y, { steps: randomBetween(8, 20) });
    await page.waitForTimeout(randomBetween(250, 800));
    await page.mouse.click(x, y, { delay: randomBetween(40, 120) });
    return `${via}-mouse`;
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(`[click] mouse click failed (${reason}); falling back to native link click`);
    await handle.evaluate((el) => ((el.closest("a") ?? el) as HTMLElement).click());
    return `${via}-dom`;
  }
}

/** Clicks an element picked in-page via evaluateHandle; returns null if nothing was picked. */
export async function trustedClickPicked(
  page: Page,
  picked: ElementHandle<Element> | null,
  via: string,
): Promise<string | null> {
  if (!picked) return null;
  try {
    return await trustedClick(page, picked, via);
  } finally {
    await picked.dispose().catch(() => undefined);
  }
}
