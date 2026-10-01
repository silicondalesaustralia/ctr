import type { Experiment } from "@prisma/client";
import type { Page } from "../browser/pw.js";
import { FAST_DRY_RUN_PERSONA } from "../behaviour/personas.js";
import { generateSessionTraits } from "../behaviour/session-traits.js";
import { acceptConsentIfPresent } from "../browser/blocked-detection.js";
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

async function captureOrganic(page: Page, experiment: Experiment, query: string): Promise<SnapshotCapture> {
  const { result } = await findTargetInSerp(page, experiment.targetDomain, experiment.maxSerpPages);
  if (!result) {
    // Not found: show page 1 rather than whichever deep page the scan stopped on.
    const pageOne = `https://www.google.com.au/search?q=${encodeURIComponent(query)}&hl=en-AU&gl=au`;
    await page.goto(pageOne, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await acceptConsentIfPresent(page);
    const blocked = await checkBlocked(page);
    if (blocked.blocked) return blockedCapture(page, blocked.reason);
  }
  return {
    outcome: result ? "captured" : "not_found",
    position: result ? (result.serpPage - 1) * 10 + result.position : null,
    serpPage: result?.serpPage ?? 1,
    source: "organic",
    resultTitle: result?.title ?? null,
    pageUrl: page.url(),
    imageJpeg: await screenshot(page),
  };
}

async function captureGmb(page: Page, experiment: Experiment, query: string): Promise<SnapshotCapture> {
  const businessName = experiment.gmbBusinessName?.trim();
  if (!businessName) throw new Error("GMB campaign has no business name");
  const found = await findGmbInLocalPack(page, {
    businessName,
    placeId: experiment.gmbPlaceId,
    query,
  });
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
    : captureOrganic(page, experiment, query);
}
