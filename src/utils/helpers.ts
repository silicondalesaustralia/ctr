import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import type { Page } from "playwright";

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function getMockSerpPath(): string {
  return join(process.cwd(), "fixtures", "mock-serp.html");
}

export function getMockSerpUrl(targetDomain: string, query: string, targetPath = "/"): string {
  const filePath = getMockSerpPath();
  const params = new URLSearchParams({
    q: query,
    domain: targetDomain,
    path: targetPath.startsWith("/") ? targetPath : `/${targetPath}`,
  });
  return `${pathToFileURL(filePath).href}?${params.toString()}`;
}

export async function loadMockSerpInPage(
  page: Page,
  targetDomain: string,
  query: string,
  targetPath = "/",
): Promise<void> {
  const html = await readFile(getMockSerpPath(), "utf-8");
  const params = new URLSearchParams({
    q: query,
    domain: targetDomain,
    path: targetPath.startsWith("/") ? targetPath : `/${targetPath}`,
  }).toString();
  const populated = html.replace(
    "const params = new URLSearchParams(window.location.search);",
    `const params = new URLSearchParams("${params.replace(/"/g, '\\"')}");`,
  );
  const dataUrl = `data:text/html;base64,${Buffer.from(populated).toString("base64")}`;
  await page.goto(dataUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
}

export function resolveGoogleSerpHref(href: string): string {
  try {
    const url = new URL(href, "https://www.google.com");
    if (url.pathname === "/url" || url.pathname.startsWith("/url")) {
      const target = url.searchParams.get("q") ?? url.searchParams.get("url");
      if (target) {
        return target;
      }
    }
    return href;
  } catch {
    return href;
  }
}

export function domainMatches(url: string, targetDomain: string): boolean {
  const resolved = resolveGoogleSerpHref(url);
  try {
    const hostname = new URL(resolved).hostname.replace(/^www\./, "");
    const normalizedTarget = targetDomain.replace(/^www\./, "");
    return hostname === normalizedTarget || hostname.endsWith(`.${normalizedTarget}`);
  } catch {
    return false;
  }
}

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function readTimezoneParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function getCalendarDateInTimezone(instant: Date, timeZone: string): CalendarDate {
  const parts = readTimezoneParts(instant, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function timezoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = readTimezoneParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

export function zonedLocalTimeToUtc(
  calendarDate: CalendarDate,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  let utcMs = Date.UTC(
    calendarDate.year,
    calendarDate.month - 1,
    calendarDate.day,
    hour,
    minute,
    second,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    utcMs = Date.UTC(
      calendarDate.year,
      calendarDate.month - 1,
      calendarDate.day,
      hour,
      minute,
      second,
    ) - timezoneOffsetMs(new Date(utcMs), timeZone);
  }

  return new Date(utcMs);
}

export function randomTimeInTimezoneWindow(
  calendarDate: CalendarDate,
  start: string,
  end: string,
  timeZone: string,
): Date {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  const minute = randomBetween(startMinutes, endMinutes);
  const hour = Math.floor(minute / 60);
  const min = minute % 60;
  const second = randomBetween(0, 59);
  return zonedLocalTimeToUtc(calendarDate, hour, min, second, timeZone);
}

export function localHourMinute(instant: Date, timeZone: string): { hour: number; minute: number } {
  const parts = readTimezoneParts(instant, timeZone);
  return { hour: parts.hour, minute: parts.minute };
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function daysInMonth(date: Date): number {
  return endOfMonth(date).getDate();
}

/** Convert BigInt fields so Express res.json() can serialize Prisma rows. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? Number(item) : item)),
  ) as T;
}
