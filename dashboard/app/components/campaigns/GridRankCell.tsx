import Link from "next/link";
import RankChange from "./RankChange";
import type { GridCoverage, GridScanTotals } from "./campaign-list-types";

interface Props {
  href: string;
  coverage: GridCoverage | null | undefined;
}

function packPercent(totals: GridScanTotals): number {
  return totals.pointCount > 0 ? Math.round((totals.inPackCount / totals.pointCount) * 100) : 0;
}

/** GMB campaigns: share of grid points in the 3-pack and its change since the last scan; click for the grid. */
export default function GridRankCell({ href, coverage }: Props) {
  if (!coverage) {
    return (
      <Link href={`${href}#coverage-grid`} style={{ color: "var(--muted)", fontSize: 11, textDecoration: "none" }}>
        No grid scan yet
      </Link>
    );
  }
  const percent = packPercent(coverage);
  const change = coverage.previous ? percent - packPercent(coverage.previous) : null;
  return (
    <Link href={`${href}#coverage-grid`} title="Open grid and history" style={{ display: "flex", flexDirection: "column", gap: 2, color: "inherit", textDecoration: "none" }}>
      <strong style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.5 }}>
        {percent}% <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>in 3-pack</span>
      </strong>
      <RankChange change={change} unit="%" suffix="since last scan" />
      <small style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
        {coverage.inPackCount}/{coverage.pointCount} points
        {coverage.avgRank !== null ? ` · avg rank ${coverage.avgRank.toFixed(1)}` : ""} · {coverage.localDate}
      </small>
    </Link>
  );
}
