/**
 * Map schedule window length to identity spacing so short bursts can still place sessions.
 * Longer windows keep organic-looking gaps.
 */
export function deriveScheduleDensity(durationDays: number): {
  repeatIdentityMinGapDays: number;
  maxSessionsPerIdentityPerDay: number;
} {
  const days = Math.max(1, Math.floor(durationDays));
  if (days <= 3) {
    return { repeatIdentityMinGapDays: 0, maxSessionsPerIdentityPerDay: 2 };
  }
  if (days <= 7) {
    return { repeatIdentityMinGapDays: 1, maxSessionsPerIdentityPerDay: 1 };
  }
  return { repeatIdentityMinGapDays: 2, maxSessionsPerIdentityPerDay: 1 };
}

export const SCHEDULE_WINDOW_PRESETS = [3, 7, 14, 21] as const;
