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

export function getMockSerpUrl(targetDomain: string, query: string): string {
  const filePath = getMockSerpPath();
  const params = new URLSearchParams({
    q: query,
    domain: targetDomain,
  });
  return `${pathToFileURL(filePath).href}?${params.toString()}`;
}

export async function loadMockSerpInPage(
  page: Page,
  targetDomain: string,
  query: string,
): Promise<void> {
  const html = await readFile(getMockSerpPath(), "utf-8");
  const params = new URLSearchParams({ q: query, domain: targetDomain }).toString();
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
