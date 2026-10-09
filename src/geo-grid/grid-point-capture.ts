import type { Experiment } from "@prisma/client";
import type { Page } from "../browser/pw.js";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";
import { GoogleBlockedError } from "../browser/blocked-detection.js";
import { collectLocalPackCandidates, findGmbInLocalPack } from "../browser/local-pack.js";
import { setSearchLocation } from "../browser/set-search-location.js";
import { googleTargetFor } from "../geo/google-target.js";
import { searchQuery } from "../rank-snapshots/snapshot-capture.js";

/** One point normally takes under a minute; past this the browser has frozen. */
export const GRID_POINT_DEADLINE_MS = 4 * 60_000;

export interface PointCapture {
  outcome: "captured" | "not_found" | "blocked";
  position: number | null;
  source: string | null;
  resultTitle: string | null;
  /** First three local results on the results page (the 3-pack). */
  topResults: string[];
  serpImageJpeg: Uint8Array<ArrayBuffer> | null;
  blockReason?: string;
}

function blocked(reason: string | undefined): PointCapture {
  return {
    outcome: "blocked",
    position: null,
    source: null,
    resultTitle: null,
    topResults: [],
    serpImageJpeg: null,
    blockReason: reason ?? "blocked",
  };
}

async function threePackTitles(page: Page): Promise<string[]> {
  try {
    return (await collectLocalPackCandidates(page)).slice(0, 3).map((candidate) => candidate.title);
  } catch (error) {
    console.warn(`[grid] could not read 3-pack titles: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Search the campaign query from one grid point and locate the listing. */
export async function captureGridPoint(
  page: Page,
  experiment: Experiment,
  query: string,
  point: GeoPoint,
  withScreenshot: boolean,
): Promise<PointCapture> {
  const businessName = experiment.gmbBusinessName?.trim();
  if (!businessName) throw new Error("GMB campaign has no business name");

  await setSearchLocation(page.context(), point);
  const blockReason = await searchQuery(page, query, googleTargetFor(experiment.country));
  if (blockReason) return blocked(blockReason);

  await page.waitForTimeout(1500);
  const topResults = await threePackTitles(page);
  const serpImageJpeg = withScreenshot
    ? new Uint8Array(await page.screenshot({ fullPage: true, type: "jpeg", quality: 70 }))
    : null;

  try {
    const found = await findGmbInLocalPack(page, { businessName, placeId: experiment.gmbPlaceId, query });
    return {
      outcome: found ? "captured" : "not_found",
      position: found?.position ?? null,
      source: found?.source ?? null,
      resultTitle: found?.title ?? null,
      topResults,
      serpImageJpeg,
    };
  } catch (error) {
    if (error instanceof GoogleBlockedError) return blocked(error.reason);
    throw error;
  }
}
