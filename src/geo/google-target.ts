import type { Page } from "../browser/pw.js";
import { DEFAULT_COUNTRY, defaultLocaleFor } from "./locations.js";

/**
 * Google country ccTLDs (google.com.au, google.co.uk, ...) now redirect to www.google.com,
 * so country and language are carried by gl/hl instead of the host.
 */
const GOOGLE_ORIGIN = "https://www.google.com";

export interface GoogleTarget {
  origin: string;
  hl: string;
  gl: string;
}

export function googleTargetFor(country?: string | null, locale?: string | null): GoogleTarget {
  const code = (country?.trim() || DEFAULT_COUNTRY).toUpperCase();
  return {
    origin: GOOGLE_ORIGIN,
    hl: locale?.trim() || defaultLocaleFor(code),
    gl: code.toLowerCase(),
  };
}

export const DEFAULT_GOOGLE_TARGET = googleTargetFor(DEFAULT_COUNTRY);

export function googleQueryParams(target: GoogleTarget): string {
  return `hl=${encodeURIComponent(target.hl)}&gl=${encodeURIComponent(target.gl)}`;
}

const pageTargets = new WeakMap<Page, GoogleTarget>();

/** Remembered by openGoogle so follow-up Google URLs (Places list, Maps) stay in the same country. */
export function rememberGoogleTarget(page: Page, target: GoogleTarget): void {
  pageTargets.set(page, target);
}

export function googleTargetForPage(page: Page): GoogleTarget {
  return pageTargets.get(page) ?? DEFAULT_GOOGLE_TARGET;
}
