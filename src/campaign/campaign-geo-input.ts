interface GeoInput {
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  geoRadiusKm?: number | null;
}

interface GeoFields {
  geoLatitude: number | null;
  geoLongitude: number | null;
  geoRadiusKm: number | null;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Undefined input keeps the stored value; a centre needs both lat and lng in range. */
export function resolveCampaignGeo(input: GeoInput, existing?: Partial<GeoFields> | null): GeoFields {
  const lat =
    input.geoLatitude === undefined ? (existing?.geoLatitude ?? null) : finiteOrNull(input.geoLatitude);
  const lng =
    input.geoLongitude === undefined
      ? (existing?.geoLongitude ?? null)
      : finiteOrNull(input.geoLongitude);
  const radius =
    input.geoRadiusKm === undefined ? (existing?.geoRadiusKm ?? null) : finiteOrNull(input.geoRadiusKm);

  const validCentre = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    geoLatitude: validCentre ? lat : null,
    geoLongitude: validCentre ? lng : null,
    geoRadiusKm: radius === null ? null : Math.min(50, Math.max(0.5, radius)),
  };
}
