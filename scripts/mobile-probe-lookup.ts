import { reverse } from "node:dns/promises";
import { auCarrierFor, normalizeAsn } from "../src/providers/proxy/carrier-asn.js";
import { classifyAuConnection, type ConnectionClass } from "../src/providers/proxy/mobile-classify.js";
import { fetchJsonViaProxy } from "../src/providers/proxy/proxy-http.js";
import type { ProxyLease } from "../src/providers/proxy/ProxyProvider.js";

const IPINFO_URL = "https://ipinfo.io/json";
const IP_API_URL = "http://ip-api.com/json/?fields=status,query,countryCode,city,regionName,as,mobile,hosting";

export interface LeaseSample {
  target: string;
  country: string;
  ip: string;
  asn: string | null;
  org: string;
  carrier: string | null;
  connection: ConnectionClass;
  ipinfoCity: string;
  ipApiCity: string;
  region: string;
  stable: boolean;
  rdns: string | null;
  /** ip-api's own cellular / hosting flags: a country-independent second opinion. */
  ipApiMobile: boolean;
  ipApiHosting: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function field(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

async function reverseDns(ip: string): Promise<string | null> {
  try {
    return (await reverse(ip))[0] ?? null;
  } catch {
    return null;
  }
}

/** AU uses known carrier ranges; elsewhere fall back to ip-api's cellular / hosting flags. */
function classify(country: string, input: Parameters<typeof classifyAuConnection>[0], mobile: boolean, hosting: boolean) {
  if (country === "AU") return classifyAuConnection(input);
  if (hosting) return "datacenter";
  return mobile ? "mobile" : "fixed";
}

/** ipinfo then ip-api through the same sticky lease: network, city per database, and whether the IP held. */
export async function sampleLease(lease: ProxyLease, target: string): Promise<LeaseSample> {
  const info = await fetchJsonViaProxy(lease, IPINFO_URL, 30_000);
  if (!isRecord(info) || !field(info, "ip")) throw new Error("Unexpected ipinfo payload");
  const api = await fetchJsonViaProxy(lease, IP_API_URL, 30_000);
  if (!isRecord(api) || field(api, "status") !== "success") throw new Error("ip-api lookup failed");

  const ip = field(info, "ip");
  const orgField = field(info, "org");
  const asn = normalizeAsn(orgField.split(" ")[0]);
  const org = orgField.replace(/^AS\d+\s*/, "") || "?";
  const rdns = field(info, "hostname") || (await reverseDns(ip));
  const country = field(info, "country") || field(api, "countryCode") || "?";
  const ipApiMobile = api.mobile === true;
  const ipApiHosting = api.hosting === true;
  return {
    target,
    country,
    ip,
    asn,
    org,
    carrier: auCarrierFor(asn),
    connection: classify(country, { ip, asn, org, rdns }, ipApiMobile, ipApiHosting),
    ipinfoCity: field(info, "city") || "?",
    ipApiCity: field(api, "city") || "?",
    region: field(info, "region") || "?",
    stable: field(api, "query") === ip,
    rdns,
    ipApiMobile,
    ipApiHosting,
  };
}
