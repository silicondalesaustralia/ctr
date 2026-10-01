export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  keyword: string;
  targetUrl: string;
  campaignKind?: string;
  region: string;
  focusCity?: string | null;
  gmbBusinessName?: string | null;
  campaignDurationDays: number;
  monthlySessionTarget: number;
  queryCount: number;
  completedSessions: number;
  scheduledSessions: number;
  /** Earliest still-scheduled session, if any. */
  nextSessionAt?: string | null;
  /** Rank observed by each session on the main keyword, oldest first. */
  rankHistory?: number[];
  updatedAt: string;
  startDate: string | null;
  endDate: string | null;
}

export type StatusFilter = "all" | "active" | "stopped" | "draft";

export type CampaignAction = "start" | "stop" | "delete";

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
  const state = code === "ALL" ? "All Australia" : (STATE_NAMES[code] ?? campaign.region);
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
