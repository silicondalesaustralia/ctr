import type { GridPoint } from "./grid-types";

/** Matches the backend: not found counts as rank 21 in averages and changes. */
export const NOT_FOUND_RANK = 21;

export const GRID_GREEN = "#198366";
export const GRID_AMBER = "#d68a12";
export const GRID_RED = "#bf4352";
export const GRID_GREY = "#9aa0ad";

function settled(point: GridPoint | undefined): point is GridPoint {
  return point?.status === "captured" || point?.status === "not_found";
}

export function pointRank(point: GridPoint | undefined): number | null {
  if (!settled(point)) return null;
  return point.status === "captured" && point.position != null
    ? Math.min(point.position, NOT_FOUND_RANK)
    : NOT_FOUND_RANK;
}

/** Green 1-3, amber 4-10, red 11+ or not found, grey when not checked. */
export function rankColor(point: GridPoint | undefined): string {
  const rank = pointRank(point);
  if (rank === null) return GRID_GREY;
  if (rank <= 3) return GRID_GREEN;
  return rank <= 10 ? GRID_AMBER : GRID_RED;
}

export function rankText(point: GridPoint | undefined): string {
  const rank = pointRank(point);
  if (rank === null) return "·";
  return rank >= NOT_FOUND_RANK ? "–" : String(rank);
}

/** Positive = moved up (better). Null when either side wasn't checked. */
export function rankChange(from: GridPoint | undefined, to: GridPoint | undefined): number | null {
  const before = pointRank(from);
  const after = pointRank(to);
  return before === null || after === null ? null : before - after;
}

export function changeColor(change: number | null): string {
  if (change === null || change === 0) return GRID_GREY;
  return change > 0 ? GRID_GREEN : GRID_RED;
}

export function changeText(change: number | null): string {
  if (change === null) return "·";
  if (change === 0) return "=";
  return change > 0 ? `+${change}` : String(change);
}
