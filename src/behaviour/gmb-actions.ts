import type { Page } from "playwright";
import type { GmbAction } from "../campaign/gmb-types.js";
import { randomBetween, sleep } from "../utils/helpers.js";

export interface GmbActionResult {
  action: GmbAction;
  attempted: boolean;
  success: boolean;
  detail?: string;
}

async function clickByLabels(page: Page, labels: string[]): Promise<boolean> {
  return page.evaluate((needles) => {
    const lowered = needles.map((n) => n.toLowerCase());
    const candidates = Array.from(
      document.querySelectorAll("a, button, [role='button'], [data-value], [aria-label]"),
    ) as HTMLElement[];

    for (const el of candidates) {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
      const dataValue = (el.getAttribute("data-value") ?? "").toLowerCase();
      const haystack = `${text} ${aria} ${dataValue}`;
      if (!lowered.some((needle) => haystack.includes(needle))) continue;

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
  }, labels);
}

export async function dwellOnListing(page: Page, secondsMin = 4, secondsMax = 12): Promise<void> {
  await sleep(randomBetween(secondsMin * 1000, secondsMax * 1000));
  await page.mouse.wheel(0, randomBetween(120, 420)).catch(() => undefined);
  await sleep(randomBetween(800, 2000));
}

export async function performGmbAction(
  page: Page,
  action: GmbAction,
): Promise<GmbActionResult> {
  if (action === "open_listing") {
    return { action, attempted: true, success: true, detail: "listing already open" };
  }

  const labels =
    action === "website"
      ? ["website", "visit website"]
      : action === "directions"
        ? ["directions", "get directions", "route"]
        : ["call", "phone"];

  const success = await clickByLabels(page, labels);
  if (!success) {
    return { action, attempted: true, success: false, detail: "control not found" };
  }

  await page.waitForTimeout(1500);
  return { action, attempted: true, success: true, detail: page.url() };
}

/** Pick one secondary action after open_listing (weighted evenly among enabled). */
export function pickSecondaryAction(actions: GmbAction[]): GmbAction | null {
  const secondary = actions.filter((action) => action !== "open_listing");
  if (secondary.length === 0) return null;
  return secondary[randomBetween(0, secondary.length - 1)] ?? null;
}
