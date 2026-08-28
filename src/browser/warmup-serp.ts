import type { Page } from "playwright";
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
