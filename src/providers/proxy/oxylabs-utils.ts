import { createHash } from "node:crypto";
import type { ProxyAllocationRequest } from "./ProxyProvider.js";

const MAX_SESSION_KEY_LENGTH = 24;

/** Hashed, not truncated, so retry suffixes ("r2".."r8") still map to distinct sticky sessions. */
function oxylabsSessionKey(raw: string): string {
  const key = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (key.length <= MAX_SESSION_KEY_LENGTH) return key;
  return createHash("sha256").update(key).digest("hex").slice(0, MAX_SESSION_KEY_LENGTH);
}

export interface OxylabsEndpoint {
  host: string;
  port: number;
  baseUsername: string;
  password: string;
}

/** Oxylabs city slugs are lower case with underscores (e.g. gold_coast). */
export function toOxylabsCitySlug(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/**
 * Sticky Oxylabs username.
 * Format: customer-{user}-cc-AU-city-{slug}-sessid-{id}-sesstime-{mins}
 */
export function buildOxylabsUsername(
  baseUsername: string,
  input: ProxyAllocationRequest,
  sessionTimeMinutes = 30,
): string {
  const user = baseUsername.startsWith("customer-") ? baseUsername : `customer-${baseUsername}`;
  const parts = [user, `cc-${(input.country || "AU").toUpperCase()}`];
  if (input.city?.trim()) parts.push(`city-${toOxylabsCitySlug(input.city)}`);
  if (input.asn) parts.push(`asn-${input.asn}`);
  parts.push(`sessid-${oxylabsSessionKey(input.sessionKey ?? "session")}`, `sesstime-${sessionTimeMinutes}`);
  return parts.join("-");
}
