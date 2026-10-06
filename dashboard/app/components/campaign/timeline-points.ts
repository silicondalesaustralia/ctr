import type { RankSnapshotRow, SnapshotKind } from "./snapshot-types";

export interface TimelinePoint {
  localDate: string;
  kind: SnapshotKind;
  /** Null when checked but not found. */
  position: number | null;
  /** National panel: cities found / checked. */
  found?: number;
  total?: number;
}

function average(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** One point per check (date + kind); national panel rows average over the cities where found. */
export function timelinePoints(rows: RankSnapshotRow[], keyword: string): TimelinePoint[] {
  const settled = rows.filter(
    (row) => row.query === keyword && (row.status === "captured" || row.status === "not_found"),
  );
  const groups = new Map<string, RankSnapshotRow[]>();
  for (const row of settled) {
    const key = `${row.localDate}|${row.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const points = [...groups.values()].map((group): TimelinePoint => {
    const first = group[0]!;
    const panel = group.filter((row) => row.panelCity);
    if (panel.length === 0) return { localDate: first.localDate, kind: first.kind, position: first.position };
    const found = panel.flatMap((row) => (row.position != null ? [row.position] : []));
    return { localDate: first.localDate, kind: first.kind, position: average(found), found: found.length, total: panel.length };
  });
  const kindOrder: Record<SnapshotKind, number> = { baseline: 0, manual: 1, daily: 2, followup: 3 };
  return points.sort((a, b) => a.localDate.localeCompare(b.localDate) || kindOrder[a.kind] - kindOrder[b.kind]);
}
