export interface RegionConfig {
  region: string;
  city: string;
  timezone: string;
  weight: number;
}

export const AU_REGIONS: RegionConfig[] = [
  { region: "NSW", city: "Sydney", timezone: "Australia/Sydney", weight: 31 },
  { region: "VIC", city: "Melbourne", timezone: "Australia/Melbourne", weight: 25 },
  { region: "QLD", city: "Brisbane", timezone: "Australia/Brisbane", weight: 20 },
  { region: "WA", city: "Perth", timezone: "Australia/Perth", weight: 10 },
  { region: "SA", city: "Adelaide", timezone: "Australia/Adelaide", weight: 9 },
  { region: "TAS", city: "Hobart", timezone: "Australia/Hobart", weight: 2 },
  { region: "ACT", city: "Canberra", timezone: "Australia/Sydney", weight: 2 },
  { region: "NT", city: "Darwin", timezone: "Australia/Darwin", weight: 1 },
];

export function pickWeightedRegion(index: number, total: number): RegionConfig {
  const cumulative: Array<{ threshold: number; region: RegionConfig }> = [];
  let sum = 0;
  for (const region of AU_REGIONS) {
    sum += region.weight;
    cumulative.push({ threshold: sum, region });
  }

  const target = ((index + 0.5) / total) * sum;
  for (const entry of cumulative) {
    if (target <= entry.threshold) {
      return entry.region;
    }
  }
  return AU_REGIONS[AU_REGIONS.length - 1]!;
}

export function isRegionCoherent(
  region: string,
  timezone: string,
  locale: string,
): boolean {
  if (locale !== "en-AU") return false;
  const match = AU_REGIONS.find((r) => r.region === region);
  if (!match) return false;
  return match.timezone === timezone;
}
