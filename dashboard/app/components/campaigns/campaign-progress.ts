import type { CampaignSummary } from "./campaign-list-types";

const DAY_MS = 86_400_000;

export interface CampaignProgress {
  /** 0 before the campaign starts. */
  day: number;
  totalDays: number;
  /** Share of the campaign's time window elapsed, 0–100; null before it starts. */
  timePercent: number | null;
  /** Completed ÷ planned sessions, uncapped; null when nothing is planned. */
  sessionPercent: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function campaignProgress(campaign: CampaignSummary, now = Date.now()): CampaignProgress {
  const start = campaign.startDate ? new Date(campaign.startDate).getTime() : NaN;
  const end = campaign.endDate ? new Date(campaign.endDate).getTime() : NaN;
  const totalDays = Number.isFinite(start) && Number.isFinite(end) && end > start
    ? Math.max(1, Math.round((end - start) / DAY_MS))
    : campaign.campaignDurationDays;
  const sessionPercent = campaign.monthlySessionTarget > 0
    ? Math.round((campaign.completedSessions / campaign.monthlySessionTarget) * 100)
    : null;

  if (!Number.isFinite(start) || now < start) {
    return { day: 0, totalDays, timePercent: null, sessionPercent };
  }
  const elapsed = now - start;
  const span = totalDays * DAY_MS;
  return {
    day: clamp(Math.floor(elapsed / DAY_MS) + 1, 1, totalDays),
    totalDays,
    timePercent: Math.round(clamp(elapsed / span, 0, 1) * 100),
    sessionPercent,
  };
}

/** Absolute time of the next session plus a short relative hint. */
export function formatNextSession(iso: string | null | undefined, now = Date.now()): { when: string; hint: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date(now).toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const when = sameDay
    ? `Today ${time}`
    : `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (minutes <= 0) return { when, hint: "Due now" };
  if (minutes < 60) return { when, hint: `in ${minutes} min` };
  const hours = Math.round(minutes / 60);
  return { when, hint: hours < 48 ? `in ${hours} h` : `in ${Math.round(hours / 24)} days` };
}
