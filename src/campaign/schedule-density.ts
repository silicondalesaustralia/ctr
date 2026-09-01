/**
 * Map schedule window length to identity spacing so short bursts can still place sessions.
 * Longer windows keep organic-looking gaps.
 */
export function deriveScheduleDensity(durationDays: number): {
  repeatIdentityMinGapDays: number;
  maxSessionsPerIdentityPerDay: number;
  minMinutesBetweenGlobalSessions: number;
} {
  const days = Math.max(1, Math.floor(durationDays));
  if (days <= 3) {
    // Burst: allow 2/day, but keep ~2h between any sessions.
    return {
      repeatIdentityMinGapDays: 0,
      maxSessionsPerIdentityPerDay: 2,
      minMinutesBetweenGlobalSessions: 120,
    };
  }
  if (days <= 7) {
    return {
      repeatIdentityMinGapDays: 1,
      maxSessionsPerIdentityPerDay: 1,
      minMinutesBetweenGlobalSessions: 90,
    };
  }
  return {
    repeatIdentityMinGapDays: 2,
    maxSessionsPerIdentityPerDay: 1,
    minMinutesBetweenGlobalSessions: 60,
  };
}

export const SCHEDULE_WINDOW_PRESETS = [3, 7, 14, 21] as const;
