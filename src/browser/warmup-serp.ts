import type { Page } from "./pw.js";
import { classifyGoogleSerpHref, randomBetween } from "../utils/helpers.js";
import {
  clickSerpResult,
  collectSerpLinkCandidates,
  isOrganicCandidate,
  type SerpResult,
} from "./serp-parser.js";

/** Excludes Google's own links ("Learn more", "Search tools") that pass the organic heuristics. */
export function leadsOffGoogle(href: string): boolean {
  return classifyGoogleSerpHref(href) !== "other_google";
}

const MAX_CLICK_PICKS = 3;

/** Organic results in random order (some may be hidden, e.g. collapsed mobile carousels). */
async function shuffledOrganicResults(page: Page): Promise<SerpResult[]> {
  const candidates = await collectSerpLinkCandidates(page);
  const results: SerpResult[] = [];
  let position = 0;
  for (const candidate of candidates) {
    if (!isOrganicCandidate(candidate)) continue;
    position += 1;
    if (!leadsOffGoogle(candidate.href)) continue;
    results.push({
      position,
      rank: position,
      title: candidate.title,
      url: candidate.href,
      displayedUrl: candidate.displayedUrl,
      serpPage: 1,
    });
  }

  if (results.length === 0) {
    const sample = candidates
      .slice(0, 6)
      .map((c) => `${c.href.slice(0, 60)} «${c.title.slice(0, 30)}» cite=${c.displayedUrl.slice(0, 30)}`)
      .join(" | ");
    console.error(
      `[serp] no organic candidates url=${page.url().slice(0, 120)} total=${candidates.length} ${sample}`,
    );
  }

  for (let i = results.length - 1; i > 0; i -= 1) {
    const j = randomBetween(0, i);
    [results[i], results[j]] = [results[j]!, results[i]!];
  }
  return results;
}

export async function clickRandomOrganicResult(page: Page): Promise<SerpResult | null> {
  const results = await shuffledOrganicResults(page);
  if (results.length === 0) {
    return null;
  }

  let lastError: unknown;
  for (const result of results.slice(0, MAX_CLICK_PICKS)) {
    try {
      await clickSerpResult(page, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Only an unfound link is retryable; once clicked, the page may have moved on.
      if (!message.startsWith("Could not click SERP result")) throw error;
      console.error(`[serp] ${message}; trying another result`);
      lastError = error;
    }
  }
  throw lastError;
}
