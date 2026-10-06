import type { Experiment } from "@prisma/client";
import { preflightGeoPoint } from "../browser/google-geo-header.js";
import { getCountry } from "../geo/locations.js";
import type { CityConfig } from "../geo/types.js";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";
import { rankCheckGeoPoint } from "./rank-check-point.js";

const PANEL_CITY_COUNT = 5;

type NationalFields = Pick<Experiment, "campaignKind" | "focusCity" | "focusRegion">;

/** URL campaigns with no city or region target rank country-wide, so one location can't represent them. */
export function isNationalCampaign(experiment: NationalFields): boolean {
  if (experiment.campaignKind === "gmb") return false;
  if (experiment.focusCity?.trim()) return false;
  return !experiment.focusRegion || experiment.focusRegion === "ALL";
}

/** The country's biggest cities by catalog weight. */
export function panelCities(country: string): CityConfig[] {
  const cities = getCountry(country)?.cities ?? [];
  return [...cities].sort((a, b) => b.weight - a.weight).slice(0, PANEL_CITY_COUNT);
}

/** Panel city per snapshot row: the top cities for national campaigns, else one "" (the campaign location). */
export function panelCityNames(experiment: NationalFields & Pick<Experiment, "country">): string[] {
  if (!isNationalCampaign(experiment)) return [""];
  const names = panelCities(experiment.country).map((city) => city.city);
  return names.length > 0 ? names : [""];
}

/** Search point for a group of rows: the panel city's centre, else the campaign's rank check location. */
export function snapshotGeoPoint(experiment: Experiment, panelCity: string): GeoPoint | undefined {
  if (!panelCity) return rankCheckGeoPoint(experiment);
  return preflightGeoPoint(experiment.country, "ALL", panelCity);
}
