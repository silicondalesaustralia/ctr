export type SnapshotKind = "baseline" | "daily" | "manual";
export type SnapshotStatus = "pending" | "running" | "captured" | "not_found" | "blocked" | "error";

export interface RankSnapshotRow {
  id: string;
  query: string;
  kind: SnapshotKind;
  localDate: string;
  status: SnapshotStatus;
  attemptCount: number;
  position: number | null;
  serpPage: number | null;
  source: string | null;
  resultTitle: string | null;
  pageUrl: string | null;
  egressCity: string | null;
  identityExternalId: string | null;
  errorMessage: string | null;
  capturedAt: string | null;
  hasImage: boolean;
}

export function positionLabel(row: RankSnapshotRow): string {
  if (row.status === "captured" && row.position !== null) return `#${row.position}`;
  if (row.status === "not_found") return "Not found";
  if (row.status === "pending" || row.status === "running") return "Queued";
  return row.status === "blocked" ? "Blocked" : "Error";
}

export const statusColors: Record<SnapshotStatus, string> = {
  captured: "#15803d",
  not_found: "#b45309",
  pending: "#64748b",
  running: "#2563eb",
  blocked: "#b91c1c",
  error: "#b91c1c",
};
