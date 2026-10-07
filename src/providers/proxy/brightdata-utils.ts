import { createHash } from "node:crypto";
import type { ProxyAllocationRequest } from "./ProxyProvider.js";

const MAX_SESSION_KEY_LENGTH = 24;

/** Hashed, not truncated, so retry suffixes ("r2".."r8") still map to distinct sticky sessions. */
function brightDataSessionKey(raw: string): string {
  const key = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (key.length <= MAX_SESSION_KEY_LENGTH) return key;
  return createHash("sha256").update(key).digest("hex").slice(0, MAX_SESSION_KEY_LENGTH);
}

export interface BrightDataEndpoint {
  host: string;
  port: number;
  /** Zone username, e.g. brd-customer-hl_xxxx-zone-mobile_au. */
  baseUsername: string;
  password: string;
}

/** Bright Data city slugs are lower case with no spaces (e.g. goldcoast). */
export function toBrightDataCitySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Sticky Bright Data username.
 * Format: brd-customer-{id}-zone-{zone}-country-au-city-{slug}-asn-{n}-session-{id}
 */
export function buildBrightDataUsername(baseUsername: string, input: ProxyAllocationRequest): string {
  const parts = [baseUsername, `country-${(input.country || "AU").toLowerCase()}`];
  if (input.city?.trim()) parts.push(`city-${toBrightDataCitySlug(input.city)}`);
  if (input.asn) parts.push(`asn-${input.asn}`);
  parts.push(`session-${brightDataSessionKey(input.sessionKey ?? "session")}`);
  return parts.join("-");
}
