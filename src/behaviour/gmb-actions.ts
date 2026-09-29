import type { Page } from "../browser/pw.js";
import type { GmbAction } from "../campaign/gmb-types.js";
import { trustedClickPicked } from "../browser/serp-trusted-click.js";
import { randomBetween, sleep } from "../utils/helpers.js";

export interface GmbActionResult {
  action: GmbAction;
  attempted: boolean;
  success: boolean;
  detail?: string;
}

const PRECISE_SELECTORS: Record<Exclude<GmbAction, "open_listing">, string> = {
  website: "a[data-item-id='authority']",
  directions: "button[data-value='Directions'], button[data-value='Get directions']",
  call: "button[data-item-id^='phone:'], a[data-item-id^='phone:']",
};

/**
 * Click an action control inside the target business's panel only. Maps keeps
 * the results feed beside the open listing, and every competitor card there has
 * its own Website / Directions / phone controls.
 */
async function clickByLabels(
  page: Page,
  labels: string[],
  precise: string,
  businessName: string,
): Promise<boolean> {
  const handle = await page.evaluateHandle(({ needles, preciseSelector, name }): HTMLElement | null => {
    const lowered = needles.map((n) => n.toLowerCase());
    const target = name.toLowerCase();
    const panels = Array.from(document.querySelectorAll("[role='main'][aria-label]")) as HTMLElement[];
    const panel =
      panels.find((el) => (el.getAttribute("aria-label") ?? "").toLowerCase().includes(target)) ??
      panels.find((el) => (el.getAttribute("aria-label") ?? "").toLowerCase().startsWith(target.slice(0, 12))) ??
      null;
    if (!panel) return null;

    const preciseHit = Array.from(panel.querySelectorAll(preciseSelector)).find(
      (el) => !el.closest("[role='feed'], [role='article']"),
    ) as HTMLElement | undefined;
    if (preciseHit) {
      preciseHit.scrollIntoView({ block: "center", inline: "nearest" });
      return preciseHit;
    }

    const candidates = (
      Array.from(
        panel.querySelectorAll("a, button, [role='button'], [data-value], [aria-label]"),
      ) as HTMLElement[]
    ).filter((el) => !el.closest("[role='feed'], [role='article']"));

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
      return el;
    }
    return null;
  }, { needles: labels, preciseSelector: precise, name: businessName });
  return (await trustedClickPicked(page, handle.asElement(), "gmb-action")) !== null;
}

export async function dwellOnListing(page: Page, secondsMin = 4, secondsMax = 12): Promise<void> {
  await sleep(randomBetween(secondsMin * 1000, secondsMax * 1000));
  await page.mouse.wheel(0, randomBetween(120, 420)).catch(() => undefined);
  await sleep(randomBetween(800, 2000));
}

export interface GmbActionOutcome {
  result: GmbActionResult;
  /** Page showing the business website (Maps opens it in a new tab). */
  sitePage: Page | null;
}

const isGoogleUrl = (url: string): boolean => /^https?:\/\/([^/]+\.)?google\.[^/]+\//i.test(url);

export async function performGmbAction(
  page: Page,
  action: GmbAction,
  businessName: string,
): Promise<GmbActionOutcome> {
  if (action === "website") return performWebsiteAction(page, businessName);
  return { result: await performPanelAction(page, action, businessName), sitePage: null };
}
async function performWebsiteAction(page: Page, businessName: string): Promise<GmbActionOutcome> {
  const popup = page.context().waitForEvent("page", { timeout: 10_000 }).catch(() => null);
  const clicked = await clickByLabels(page, ["website", "visit website"], PRECISE_SELECTORS.website, businessName);
  if (!clicked) {
    return { result: { action: "website", attempted: true, success: false, detail: "control not found in target panel" }, sitePage: null };
  }

  const opened = await popup;
  const sitePage = opened ?? page;
  await sitePage.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  await sitePage.waitForTimeout(1500);
  const url = sitePage.url();
  if (isGoogleUrl(url) || url === "about:blank") {
    return { result: { action: "website", attempted: true, success: false, detail: `website did not open (${url.slice(0, 120)})` }, sitePage: null };
  }
  if (opened) await opened.bringToFront().catch(() => undefined);
  return { result: { action: "website", attempted: true, success: true, detail: url }, sitePage };
}

async function performPanelAction(
  page: Page,
  action: GmbAction,
  businessName: string,
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

  const success = await clickByLabels(page, labels, PRECISE_SELECTORS[action], businessName);
  if (!success) {
    return { action, attempted: true, success: false, detail: "control not found in target panel" };
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
