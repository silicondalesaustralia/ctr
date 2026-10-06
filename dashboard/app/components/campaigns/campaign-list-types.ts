export interface RankPoint {
  /** Null when the check ran but the target wasn't found. */
  position: number | null;
  source: string | null;
  localDate: string;
  capturedAt: string | null;
  /** National panel only: cities where the target was found, out of cities checked. */
  foundCities?: number;
  totalCities?: number;
}

export interface GridScanTotals {
  inPackCount: number;
  pointCount: number;
  avgRank: number | null;
  localDate: string;
}

/** Latest finished coverage grid, with the scan before it for the change. */
export interface GridCoverage extends GridScanTotals {
  previous: GridScanTotals | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  keyword: string;
  targetUrl: string;
  campaignKind?: string;
  region: string;
  country?: string;
  focusCity?: string | null;
  gmbBusinessName?: string | null;
  campaignDurationDays: number;
  monthlySessionTarget: number;
  queryCount: number;
  completedSessions: number;
  scheduledSessions: number;
  /** Earliest still-scheduled session, if any. */
  nextSessionAt?: string | null;
  /** Rank snapshots (fixed-point checks) on the main keyword, oldest first. */
  rankHistory?: RankPoint[];
  /** A rank check is waiting or running. */
  rankCheckQueued?: boolean;
  gridCoverage?: GridCoverage | null;
  updatedAt: string;
  startDate: string | null;
  endDate: string | null;
}

export type StatusFilter = "all" | "active" | "stopped" | "draft";

export type CampaignAction = "start" | "stop" | "delete" | "rank";

const RANK_SOURCE_LABELS: Record<string, string> = {
  local_pack: "3-pack",
  more_places: "Places list",
  maps_keyword: "Maps",
  organic: "Organic",
  national: "National avg",
};

/** Which Google list the rank came from; 3-pack and Places list positions are not comparable. */
export function rankSourceLabel(source: string | null): string {
  return source ? (RANK_SOURCE_LABELS[source] ?? source) : "";
}

const STATE_NAMES: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

export function matchesStatus(status: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return status === "active";
  if (filter === "draft") return status === "draft";
  return status !== "active" && status !== "draft";
}

/** Primary line (city) and secondary line (state) for the region column. */
export function regionParts(campaign: CampaignSummary): { primary: string; secondary: string } {
  const code = campaign.region.toUpperCase();
  const country = (campaign.country ?? "AU").toUpperCase();
  const state =
    country !== "AU"
      ? code === "ALL"
        ? `All ${country}`
        : `${campaign.region}, ${country}`
      : code === "ALL"
        ? "All Australia"
        : (STATE_NAMES[code] ?? campaign.region);
  if (campaign.focusCity) return { primary: campaign.focusCity, secondary: state };
  return { primary: code === "ALL" ? "All regions" : state, secondary: code === "ALL" ? "Unrestricted" : code };
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function campaignTitle(campaign: CampaignSummary): string {
  if (campaign.campaignKind === "gmb") {
    return campaign.gmbBusinessName?.trim() || campaign.name;
  }
  return displayUrl(campaign.targetUrl).split("/")[0] || campaign.name;
}

export function campaignInitials(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
