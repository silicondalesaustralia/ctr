import type { Experiment } from "@prisma/client";
import { preflightGeoPoint } from "../browser/google-geo-header.js";
import type { GeoPoint } from "../providers/browser/BrowserProfileProvider.js";

type RankCheckFields = Pick<
  Experiment,
  "country" | "focusRegion" | "focusCity" | "rankCheckLatitude" | "rankCheckLongitude"
>;

/**
 * One fixed point per campaign, like a rank checker set to a location. Not the GPS
 * centre: that is often the business's own suburb, where it always ranks #1.
 */
export function rankCheckGeoPoint(experiment: RankCheckFields): GeoPoint | undefined {
  if (experiment.rankCheckLatitude !== null && experiment.rankCheckLongitude !== null) {
    return { latitude: experiment.rankCheckLatitude, longitude: experiment.rankCheckLongitude };
  }
  return preflightGeoPoint(experiment.country, experiment.focusRegion ?? "ALL", experiment.focusCity);
}
