import type { Page } from "../browser/pw.js";
import type { GmbAction } from "../campaign/gmb-types.js";
import { expandMobilePlaceSheet } from "../browser/mobile-local-nav.js";
import { randomBetween, sleep } from "../utils/helpers.js";
import { clickByLabels } from "./gmb-panel-click.js";

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

const NOT_FOUND = "control not found in target panel";

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

/** result.action is the action actually performed (directions falls back to website when the listing has none). */
export async function performGmbAction(
  page: Page,
  action: GmbAction,
  businessName: string,
): Promise<GmbActionOutcome> {
  await expandMobilePlaceSheet(page);
  if (action === "website") return performWebsiteAction(page, businessName);
  const result = await performPanelAction(page, action, businessName);
  // Service-area businesses have no address, so no Directions control on any device.
  if (action === "directions" && result.detail === NOT_FOUND) {
    console.error("[gmb] no Directions on this listing; opening the website instead");
    return performWebsiteAction(page, businessName);
  }
  return { result, sitePage: null };
}

async function performWebsiteAction(page: Page, businessName: string): Promise<GmbActionOutcome> {
  const popup = page.context().waitForEvent("page", { timeout: 10_000 }).catch(() => null);
  const { clicked, href } = await clickByLabels(page, ["website", "visit website"], PRECISE_SELECTORS.website, businessName);
  if (!clicked) {
    return { result: { action: "website", attempted: true, success: false, detail: NOT_FOUND }, sitePage: null };
  }

  const opened = await popup;
  const sitePage = opened ?? page;
  await sitePage.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => undefined);
  await sitePage.waitForTimeout(1500);
  if (!opened && href && isGoogleUrl(page.url())) {
    // Mobile Maps sometimes swallows the tap; follow the same /url?q= redirect it points at.
    console.error("[gmb] website tap opened nothing; following the link directly");
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((error: unknown) => {
      console.error(`[gmb] website link failed: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    });
    await page.waitForTimeout(1500);
  }
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
        ? ["directions", "get directions"]
        : ["call", "phone"];

  const { clicked } = await clickByLabels(page, labels, PRECISE_SELECTORS[action], businessName);
  if (!clicked) {
    return { action, attempted: true, success: false, detail: NOT_FOUND };
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
