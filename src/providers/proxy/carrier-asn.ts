/** AU mobile network operators. These ASNs also carry fixed broadband, so a match is necessary, not sufficient. */
export const AU_CARRIER_ASNS: Record<string, string> = {
  AS1221: "Telstra",
  AS4804: "Optus",
  AS133612: "Vodafone (TPG)",
  AS7545: "TPG",
};

export function normalizeAsn(asn: string | number | undefined | null): string | null {
  if (asn === undefined || asn === null || asn === "") return null;
  const digits = String(asn).replace(/^AS/i, "").trim();
  return /^\d+$/.test(digits) ? `AS${digits}` : null;
}

export function auCarrierFor(asn: string | number | undefined | null): string | null {
  const normalized = normalizeAsn(asn);
  return normalized ? (AU_CARRIER_ASNS[normalized] ?? null) : null;
}
