export type GridScanKind = "baseline" | "weekly" | "manual" | "followup";
export type GridScanStatus = "pending" | "running" | "complete" | "partial" | "error";
export type GridMode = "before" | "latest" | "change";

export interface GridScan {
  id: string;
  query: string;
  kind: GridScanKind;
  localDate: string;
  status: GridScanStatus;
  centreLatitude: number;
  centreLongitude: number;
  gridSize: number;
  spacingKm: number;
  inPackCount: number | null;
  /** Points in the phone 3-pack; null when no mobile pass ran. */
  mobileInPackCount: number | null;
  foundCount: number | null;
  avgRank: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  pointCount: number;
  hasImage: boolean;
}

export interface GridPoint {
  id: string;
  row: number;
  col: number;
  latitude: number;
  longitude: number;
  status: "pending" | "running" | "captured" | "not_found" | "blocked" | "error";
  position: number | null;
  source: string | null;
  resultTitle: string | null;
  topResults: string[];
  mobilePackPosition: number | null;
  mobileTopResults: string[];
  mobileCheckedAt: string | null;
  errorMessage: string | null;
}

const KIND_LABELS: Record<GridScanKind, string> = {
  baseline: "Baseline",
  weekly: "Weekly",
  manual: "Manual",
  followup: "Follow-up",
};

export function scanLabel(scan: GridScan): string {
  const status = scan.status === "complete" ? "" : ` (${scan.status})`;
  return `${scan.localDate} · ${KIND_LABELS[scan.kind]}${status}`;
}

export function isScanOpen(scan: GridScan): boolean {
  return scan.status === "pending" || scan.status === "running";
}
