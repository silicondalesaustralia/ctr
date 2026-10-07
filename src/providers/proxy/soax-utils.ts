import { createHash } from "node:crypto";
import type { ProxyAllocationRequest } from "./ProxyProvider.js";

const MAX_SESSION_KEY_LENGTH = 32;

/** SOAX session ids: letters/digits/underscores, max 32. Long keys are hashed so retries stay distinct. */
function soaxSessionKey(raw: string): string {
  const key = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (key.length <= MAX_SESSION_KEY_LENGTH) return key;
  return createHash("sha256").update(key).digest("hex").slice(0, MAX_SESSION_KEY_LENGTH);
}

export interface SoaxEndpoint {
  host: string;
  port: number;
  /** Network rule: "mob" (mobile), "res" (residential) or "res_mob". */
  network: string;
  /** Package key; SOAX puts it in the password field, rules go in the username. */
  packageKey: string;
}

/** SOAX multi-word values use underscores; hyphens are the rule delimiter. */
export function toSoaxSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/**
 * Sticky SOAX rules username.
 * Format: network-mob-country-au-city-{slug}-isp-{code}-asn-{n}-session-{id}-rotate-timed_{mins}m
 * Timed rotation keeps the node across idle gaps; plain sessions expire after 60s of inactivity.
 */
export function buildSoaxUsername(network: string, input: ProxyAllocationRequest, sessionMinutes = 30): string {
  const parts = [`network-${network}`, `country-${(input.country || "AU").toLowerCase()}`];
  if (input.city?.trim()) parts.push(`city-${toSoaxSlug(input.city)}`);
  if (input.isp?.trim()) parts.push(`isp-${toSoaxSlug(input.isp)}`);
  if (input.asn) parts.push(`asn-${input.asn}`);
  parts.push(`session-${soaxSessionKey(input.sessionKey ?? "session")}`, `rotate-timed_${sessionMinutes}m`);
  return parts.join("-");
}
