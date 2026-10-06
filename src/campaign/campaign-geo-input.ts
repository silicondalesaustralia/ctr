interface GeoInput {
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  geoRadiusKm?: number | null;
  rankCheckLatitude?: number | null;
  rankCheckLongitude?: number | null;
}

interface GeoFields {
  geoLatitude: number | null;
  geoLongitude: number | null;
  geoRadiusKm: number | null;
  rankCheckLatitude: number | null;
  rankCheckLongitude: number | null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Undefined input keeps the stored value. */
function pick(input: number | null | undefined, stored: number | null | undefined): number | null {
  return input === undefined ? (stored ?? null) : finiteOrNull(input);
}

/** A point needs both lat and lng in range, else both are cleared. */
function validPoint(lat: number | null, lng: number | null): [number | null, number | null] {
  const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return valid ? [lat, lng] : [null, null];
}

export function resolveCampaignGeo(input: GeoInput, existing?: Partial<GeoFields> | null): GeoFields {
  const [geoLatitude, geoLongitude] = validPoint(
    pick(input.geoLatitude, existing?.geoLatitude),
    pick(input.geoLongitude, existing?.geoLongitude),
  );
  const [rankCheckLatitude, rankCheckLongitude] = validPoint(
    pick(input.rankCheckLatitude, existing?.rankCheckLatitude),
    pick(input.rankCheckLongitude, existing?.rankCheckLongitude),
  );
  const radius = pick(input.geoRadiusKm, existing?.geoRadiusKm);
  return {
    geoLatitude,
    geoLongitude,
    geoRadiusKm: radius === null ? null : Math.min(50, Math.max(0.5, radius)),
    rankCheckLatitude,
    rankCheckLongitude,
  };
}
