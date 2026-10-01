import type { Page } from "./pw.js";
import { randomBetween } from "../utils/helpers.js";
import {
  clickSerpResult,
  collectSerpLinkCandidates,
  isOrganicCandidate,
  type SerpResult,
} from "./serp-parser.js";

export async function pickRandomOrganicResult(page: Page): Promise<SerpResult | null> {
  const candidates = await collectSerpLinkCandidates(page);
  const organic = candidates.filter((candidate) => isOrganicCandidate(candidate));

  if (organic.length === 0) {
    const sample = candidates
      .slice(0, 6)
      .map((c) => `${c.href.slice(0, 60)} «${c.title.slice(0, 30)}» cite=${c.displayedUrl.slice(0, 30)}`)
      .join(" | ");
    console.error(
      `[serp] no organic candidates url=${page.url().slice(0, 120)} total=${candidates.length} ${sample}`,
    );
    return null;
  }

  const pick = organic[randomBetween(0, organic.length - 1)]!;
  let position = 0;
  for (const candidate of candidates) {
    if (!isOrganicCandidate(candidate)) continue;
    position += 1;
    if (candidate.href === pick.href && candidate.title === pick.title) {
      break;
    }
  }

  return {
    position,
    rank: position,
    title: pick.title,
    url: pick.href,
    displayedUrl: pick.displayedUrl,
    serpPage: 1,
  };
}

export async function clickRandomOrganicResult(page: Page): Promise<SerpResult | null> {
  const result = await pickRandomOrganicResult(page);
  if (!result) {
    return null;
  }

  await clickSerpResult(page, result);
  return result;
}
