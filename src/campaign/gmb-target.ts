export interface ParsedGmbTarget {
  mapsUrl: string;
  placeId: string | null;
  cid: string | null;
  targetDomain: string;
}

function firstMatch(input: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Normalize Maps / Place URL or bare Place ID / CID into campaign target fields. */
export function parseGmbTarget(input: string): ParsedGmbTarget {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Maps URL or Place ID is required");
  }

  const barePlaceId = raw.match(/^(ChIJ[\w-]+)$/);
  if (barePlaceId) {
    const placeId = barePlaceId[1]!;
    return {
      mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${placeId}`,
      placeId,
      cid: null,
      targetDomain: `gmb:${placeId}`,
    };
  }

  const bareCid = raw.match(/^(?:cid[=:]?)?(\d{6,})$/i);
  if (bareCid && !raw.includes("://")) {
    const cid = bareCid[1]!;
    return {
      mapsUrl: `https://www.google.com/maps?cid=${cid}`,
      placeId: null,
      cid,
      targetDomain: `gmb:cid:${cid}`,
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid Google Maps URL, Place ID, or CID");
  }

  if (!/google\.(com|com\.au)|g\.page|maps\.app\.goo\.gl/i.test(url.hostname)) {
    throw new Error("GMB target must be a Google Maps / Business Profile URL");
  }

  const cid =
    url.searchParams.get("cid") ??
    firstMatch(raw, [/[?&]cid=(\d+)/i, /!3d\d+\.\d+!4d\d+\.\d+.*cid[=:](\d+)/i]);

  const placeId =
    url.searchParams.get("query_place_id") ??
    url.searchParams.get("place_id") ??
    firstMatch(raw, [
      /[?&]query_place_id=([^&]+)/i,
      /place\/[^/]+\/data=.*?!(?:1s)(0x[\da-f]+:0x[\da-f]+)/i,
      /!(?:1s)(ChIJ[\w-]+)/,
      /(ChIJ[\w-]+)/,
    ]);

  const key = placeId ?? (cid ? `cid:${cid}` : null);
  if (!key) {
    throw new Error("Could not find a Place ID or CID in that Maps URL");
  }

  return {
    mapsUrl: url.toString(),
    placeId: placeId && placeId.startsWith("ChIJ") ? placeId : placeId,
    cid,
    targetDomain: `gmb:${key}`,
  };
}
