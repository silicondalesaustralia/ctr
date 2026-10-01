import type { Experiment } from "@prisma/client";
import type { Page } from "../browser/pw.js";
import { FAST_DRY_RUN_PERSONA } from "../behaviour/personas.js";
import { generateSessionTraits } from "../behaviour/session-traits.js";
import { GoogleBlockedError } from "../browser/blocked-detection.js";
import { checkBlocked, openGoogle, typeAndSubmitQuery } from "../browser/google-search.js";
import { findGmbInLocalPack } from "../browser/local-pack.js";
import { findTargetInSerp } from "../browser/serp-parser.js";

export interface SnapshotCapture {
  outcome: "captured" | "not_found" | "blocked";
  position: number | null;
  serpPage: number | null;
  source: string | null;
  resultTitle: string | null;
  pageUrl: string;
  imageJpeg: Uint8Array<ArrayBuffer> | null;
  blockReason?: string;
}

const SCREENSHOT_QUALITY = 70;

async function screenshot(page: Page): Promise<Uint8Array<ArrayBuffer>> {
  await page.waitForTimeout(1500);
  const jpeg = await page.screenshot({ fullPage: true, type: "jpeg", quality: SCREENSHOT_QUALITY });
  return new Uint8Array(jpeg);
}

function blockedCapture(page: Page, reason: string | undefined): SnapshotCapture {
  return {
    outcome: "blocked",
    position: null,
    serpPage: null,
    source: null,
    resultTitle: null,
    pageUrl: page.url(),
    imageJpeg: null,
    blockReason: reason ?? "blocked",
  };
}

/** Returns a block reason, or null when the SERP loaded cleanly. */
async function searchQuery(page: Page, query: string): Promise<string | null> {
  await openGoogle(page);
  const afterOpen = await checkBlocked(page);
  if (afterOpen.blocked) return afterOpen.reason ?? "blocked";

  const traits = generateSessionTraits(FAST_DRY_RUN_PERSONA, `snapshot-${Date.now()}`, "snapshot");
  await typeAndSubmitQuery(page, query, FAST_DRY_RUN_PERSONA, traits);
  const afterSearch = await checkBlocked(page);
  return afterSearch.blocked ? (afterSearch.reason ?? "blocked") : null;
}

async function captureOrganic(page: Page, experiment: Experiment): Promise<SnapshotCapture> {
  // Page 1 is what a "not found" snapshot shows; reloading it later by URL draws CAPTCHAs.
  const pageOneUrl = page.url();
  const pageOneImage = await screenshot(page);
  let result: Awaited<ReturnType<typeof findTargetInSerp>>["result"];
  try {
    ({ result } = await findTargetInSerp(page, experiment.targetDomain, experiment.maxSerpPages));
  } catch (error) {
    if (error instanceof GoogleBlockedError) return blockedCapture(page, error.reason);
    throw error;
  }
  if (!result) {
    return {
      outcome: "not_found",
      position: null,
      serpPage: 1,
      source: "organic",
      resultTitle: null,
      pageUrl: pageOneUrl,
      imageJpeg: pageOneImage,
    };
  }
  return {
    outcome: "captured",
    position: result.rank,
    serpPage: result.serpPage,
    source: "organic",
    resultTitle: result.title,
    pageUrl: page.url(),
    imageJpeg: result.serpPage === 1 ? pageOneImage : await screenshot(page),
  };
}

async function captureGmb(page: Page, experiment: Experiment, query: string): Promise<SnapshotCapture> {
  const businessName = experiment.gmbBusinessName?.trim();
  if (!businessName) throw new Error("GMB campaign has no business name");
  let found: Awaited<ReturnType<typeof findGmbInLocalPack>>;
  try {
    found = await findGmbInLocalPack(page, { businessName, placeId: experiment.gmbPlaceId, query });
  } catch (error) {
    if (error instanceof GoogleBlockedError) return blockedCapture(page, error.reason);
    throw error;
  }
  return {
    outcome: found ? "captured" : "not_found",
    position: found?.position ?? null,
    serpPage: found ? 1 : null,
    source: found?.source ?? null,
    resultTitle: found?.title ?? null,
    pageUrl: page.url(),
    imageJpeg: await screenshot(page),
  };
}

export async function captureQuerySnapshot(
  page: Page,
  experiment: Experiment,
  query: string,
): Promise<SnapshotCapture> {
  const blockReason = await searchQuery(page, query);
  if (blockReason) return blockedCapture(page, blockReason);
  return experiment.campaignKind === "gmb"
    ? captureGmb(page, experiment, query)
    : captureOrganic(page, experiment);
}
