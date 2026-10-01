import { zonedLocalTimeToUtc, type CalendarDate } from "../utils/helpers.js";

function parseHm(value: string): { hour: number; minute: number } {
  const [hour = "0", minute = "0"] = value.split(":");
  return { hour: Number.parseInt(hour, 10), minute: Number.parseInt(minute, 10) };
}

/**
 * Chronological random times inside the local daily window, at least gapMinutes apart.
 * Drawing in order (rather than clamping random picks to last + gap) avoids sessions
 * spilling past the window end at exact gap intervals. Returns fewer times if they cannot fit.
 */
export function randomDayTimes(
  calendarDate: CalendarDate,
  count: number,
  windowStart: string,
  windowEnd: string,
  timeZone: string,
  gapMinutes: number,
): Date[] {
  if (count <= 0) return [];
  const start = parseHm(windowStart);
  const end = parseHm(windowEnd);
  const startMs = zonedLocalTimeToUtc(calendarDate, start.hour, start.minute, 0, timeZone).getTime();
  let endMs = zonedLocalTimeToUtc(calendarDate, end.hour, end.minute, 0, timeZone).getTime();
  if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;

  const gapMs = Math.max(0, gapMinutes) * 60 * 1000;
  const windowMs = endMs - startMs;
  const fit = gapMs > 0 ? Math.min(count, Math.floor(windowMs / gapMs) + 1) : count;
  const slackMs = windowMs - (fit - 1) * gapMs;

  const offsets = Array.from({ length: fit }, () => Math.random() * slackMs).sort((a, b) => a - b);
  return offsets.map((offset, index) => new Date(Math.round(startMs + offset + index * gapMs)));
}
