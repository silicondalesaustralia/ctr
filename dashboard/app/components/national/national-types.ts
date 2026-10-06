export interface PanelRank {
  position: number | null;
  source: string | null;
  localDate: string;
  status: "captured" | "not_found";
}

export interface PanelCity {
  city: string;
  latitude: number;
  longitude: number;
  latest: PanelRank | null;
  baseline: PanelRank | null;
}

export interface NationalPanel {
  national: boolean;
  cities: PanelCity[];
  average: { latest: number | null; baseline: number | null; found: number; total: number } | null;
}

export function panelRankText(rank: PanelRank | null): string {
  if (!rank) return "—";
  return rank.status === "captured" && rank.position != null ? `#${rank.position}` : "Not found";
}

/** Positive = moved up since baseline; null when either side has no position. */
export function panelChange(city: PanelCity): number | null {
  const before = city.baseline?.position ?? null;
  const after = city.latest?.position ?? null;
  return before === null || after === null ? null : before - after;
}
