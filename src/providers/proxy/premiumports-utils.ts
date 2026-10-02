import { createHash } from "node:crypto";
import type { ProxyAllocationRequest } from "./ProxyProvider.js";

const MAX_SESSION_KEY_LENGTH = 24;

/**
 * Long keys are hashed, not truncated: retries append "r2".."r8" to a 25-char session id,
 * and cutting that suffix off would request the same sticky IP on every retry.
 */
function premiumPortsSessionKey(raw: string): string {
  const key = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (key.length <= MAX_SESSION_KEY_LENGTH) return key;
  return createHash("sha256").update(key).digest("hex").slice(0, MAX_SESSION_KEY_LENGTH);
}

export interface PremiumPortsEndpoint {
  host: string;
  port: number;
  baseUsername: string;
  password: string;
}

/** Cities with no / unreliable Premium Ports inventory — country-only sticky. */
const COUNTRY_ONLY_CITIES = new Set(["darwin", "bradford"]);

export function toPremiumPortsCitySlug(city: string): string {
  return city.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

export function shouldSkipCityTargeting(city?: string): boolean {
  if (!city?.trim()) return true;
  return COUNTRY_ONLY_CITIES.has(toPremiumPortsCitySlug(city));
}

/**
 * Sticky Premium Ports username.
 * Format: {user}-country-au-city-{slug}-session-{id}-ttl-{mins}
 * Omit city for COUNTRY_ONLY_CITIES so allocate still returns an in-country IP.
 */
export function buildPremiumPortsUsername(
  baseUsername: string,
  input: ProxyAllocationRequest,
  sessionTtlMinutes = 30,
): string {
  const country = (input.country || "AU").toLowerCase();
  const sessionKey = premiumPortsSessionKey(input.sessionKey ?? "session");
  const parts = [baseUsername, `country-${country}`];

  if (!shouldSkipCityTargeting(input.city) && input.city) {
    parts.push(`city-${toPremiumPortsCitySlug(input.city)}`);
  }

  parts.push(`session-${sessionKey}`, `ttl-${sessionTtlMinutes}`);
  return parts.join("-");
}
