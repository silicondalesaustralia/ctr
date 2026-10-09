import { GRID_GREEN, GRID_GREY, GRID_RED } from "./grid-colors";
import { scanLabel, type GridScan } from "./grid-types";

interface Props {
  /** Newest first, one keyword. */
  scans: GridScan[];
}

const cell = { padding: "6px 10px", borderBottom: "1px solid var(--line)", textAlign: "left" as const };

function percent(scan: GridScan): number | null {
  return scan.inPackCount === null || scan.pointCount === 0 ? null : Math.round((scan.inPackCount / scan.pointCount) * 100);
}

/** Every grid scan with 3-pack share, average rank and the change since the scan before it. */
export default function GridHistoryTable({ scans }: Props) {
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
      <thead>
        <tr style={{ color: "#767d8e" }}>
          <th style={cell}>Scan</th>
          <th style={cell}>In 3-pack</th>
          <th style={cell}>Phone 3-pack</th>
          <th style={cell}>Avg grid rank</th>
          <th style={cell}>Change</th>
        </tr>
      </thead>
      <tbody>
        {scans.map((scan, index) => {
          const share = percent(scan);
          const before = scans.slice(index + 1).map(percent).find((value) => value !== null);
          const change = share === null || before === undefined || before === null ? null : share - before;
          return (
            <tr key={scan.id}>
              <td style={cell}>{scanLabel(scan)}</td>
              <td style={{ ...cell, fontWeight: 600 }}>
                {share === null ? "—" : `${share}%`}
                {scan.inPackCount !== null && (
                  <span style={{ fontWeight: 400, color: "#767d8e" }}> · {scan.inPackCount}/{scan.pointCount}</span>
                )}
              </td>
              <td style={cell}>
                {scan.mobileInPackCount === null ? "—" : `${scan.mobileInPackCount}/${scan.pointCount}`}
              </td>
              <td style={cell}>{scan.avgRank === null ? "—" : scan.avgRank.toFixed(1)}</td>
              <td style={{ ...cell, color: change === null || change === 0 ? GRID_GREY : change > 0 ? GRID_GREEN : GRID_RED }}>
                {change === null ? "—" : change === 0 ? "No change" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
