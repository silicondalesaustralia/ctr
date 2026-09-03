import type { ProxyAllocationRequest } from "./ProxyProvider.js";

export interface PremiumPortsEndpoint {
  host: string;
  port: number;
  baseUsername: string;
  password: string;
}

/** Cities with no / unreliable Premium Ports inventory — country-only sticky. */
const COUNTRY_ONLY_CITIES = new Set(["darwin"]);

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
 * Omit city for Darwin (no inventory) so allocate still returns an AU IP.
 */
export function buildPremiumPortsUsername(
  baseUsername: string,
  input: ProxyAllocationRequest,
  sessionTtlMinutes = 30,
): string {
  const country = (input.country || "AU").toLowerCase();
  const sessionKey = (input.sessionKey ?? "session")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);
  const parts = [baseUsername, `country-${country}`];

  if (!shouldSkipCityTargeting(input.city) && input.city) {
    parts.push(`city-${toPremiumPortsCitySlug(input.city)}`);
  }

  parts.push(`session-${sessionKey}`, `ttl-${sessionTtlMinutes}`);
  return parts.join("-");
}
