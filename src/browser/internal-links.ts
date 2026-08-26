import type { Page } from "playwright";
import { domainMatches } from "../utils/helpers.js";

export interface LinkCandidate {
  href: string;
  text: string;
  score: number;
}

export function scoreInternalLink(
  href: string,
  text: string,
  pageUrl: string,
  context: {
    visible: boolean;
    inMain: boolean;
    inNav: boolean;
    inFooter: boolean;
  },
): number {
  let score = 0;
  const pageHost = new URL(pageUrl).hostname;

  try {
    const linkHost = new URL(href, pageUrl).hostname;
    if (linkHost === pageHost) score += 10;
    else score -= 100;
  } catch {
    return -100;
  }

  if (context.visible) score += 10;
  if (context.inMain) score += 8;
  if (text.trim().length >= 4) score += 5;
  if (context.inNav) score += 2;
  if (context.inFooter) score -= 3;

  const lower = `${href} ${text}`.toLowerCase();
  if (/login|sign in|account|logout/.test(lower)) score -= 20;
  if (/cart|checkout|buy now|payment/.test(lower)) score -= 20;

  return score;
}

export async function pickInternalLink(page: Page): Promise<string | null> {
  const pageUrl = page.url();
  const links = page.locator("a[href]");
  const count = await links.count();
  const candidates: LinkCandidate[] = [];

  for (let i = 0; i < count; i += 1) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    const visible = await link.isVisible().catch(() => false);
    if (!visible) continue;

    const text = (await link.innerText().catch(() => "")).trim();
    const inMain = (await link.locator("xpath=ancestor::main | ancestor::article").count()) > 0;
    const inNav = (await link.locator("xpath=ancestor::nav").count()) > 0;
    const inFooter = (await link.locator("xpath=ancestor::footer").count()) > 0;

    const absoluteHref = new URL(href, pageUrl).href;
    if (!domainMatches(absoluteHref, new URL(pageUrl).hostname.replace(/^www\./, ""))) {
      continue;
    }

    const score = scoreInternalLink(absoluteHref, text, pageUrl, {
      visible,
      inMain,
      inNav,
      inFooter,
    });

    if (score > 0) {
      candidates.push({ href: absoluteHref, text, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.href ?? null;
}
