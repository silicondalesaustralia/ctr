import type { Identity } from "@prisma/client";

/**
 * Most-trusted first. A cold profile gets a truncated SERP from Google (it can stop after
 * ~11 results), so preflight must use a warmed profile with real history when one exists.
 */
export function rankByWarmth(identities: Identity[]): Identity[] {
  return [...identities].sort(
    (a, b) =>
      Number(b.warmupStatus === "eligible") - Number(a.warmupStatus === "eligible") ||
      a.consecutiveBlocks - b.consecutiveBlocks ||
      b.warmupSessionsCompleted - a.warmupSessionsCompleted ||
      b.googleSessions - a.googleSessions,
  );
}
