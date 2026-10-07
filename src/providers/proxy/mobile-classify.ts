import { normalizeAsn } from "./carrier-asn.js";

export type ConnectionClass = "mobile" | "possible_mobile" | "fixed" | "datacenter";

/** Ranges known to be carrier-mobile only (Telstra mobile CGNAT v4 and mobile v6). */
const MOBILE_V4_CIDRS: Array<[string, number]> = [["1.128.0.0", 11]];
const MOBILE_V6_PREFIXES = ["2001:8004:"];
/** Vodafone AU is mobile-only; TPG's fixed lines sit on AS7545. */
const MOBILE_ONLY_ASNS = new Set(["AS133612"]);
/** Carriers whose mobile IPs typically have no reverse DNS, unlike their home broadband. */
const MIXED_CARRIER_ASNS = new Set(["AS1221", "AS4804"]);
const DATACENTER = /datacamp|datapacket|hosting|cloud|amazon|google|microsoft|ovh|hetzner|digitalocean|linode|m247/i;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return parts.reduce((total, part) => total * 256 + part, 0);
}

export function inMobileRange(ip: string): boolean {
  if (ip.includes(":")) return MOBILE_V6_PREFIXES.some((prefix) => ip.toLowerCase().startsWith(prefix));
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return MOBILE_V4_CIDRS.some(([base, bits]) => {
    const baseValue = ipv4ToInt(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return baseValue !== null && (value & mask) === (baseValue & mask);
  });
}

/** Best-effort AU classification from IP, ASN, org name and reverse DNS. */
export function classifyAuConnection(input: {
  ip: string;
  asn: string | null;
  org: string;
  rdns: string | null;
}): ConnectionClass {
  const asn = normalizeAsn(input.asn);
  if (DATACENTER.test(input.org) || (input.rdns && DATACENTER.test(input.rdns))) return "datacenter";
  if (inMobileRange(input.ip) || (asn && MOBILE_ONLY_ASNS.has(asn))) return "mobile";
  if (asn && MIXED_CARRIER_ASNS.has(asn) && !input.rdns) return "possible_mobile";
  return "fixed";
}
