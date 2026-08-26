import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

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

export function domainMatches(url: string, targetDomain: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
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
