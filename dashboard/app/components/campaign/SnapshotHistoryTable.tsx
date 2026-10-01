"use client";

import { cellStyle, placesSourceLabel, thStyle } from "./shared";
import { positionLabel, statusColors, type RankSnapshotRow } from "./snapshot-types";

interface Props {
  rows: RankSnapshotRow[];
  selectedId: string | null;
  onSelect: (row: RankSnapshotRow) => void;
}

const kindLabels: Record<RankSnapshotRow["kind"], string> = {
  baseline: "Baseline",
  daily: "End of day",
  manual: "Manual",
  session: "After session",
};

function whenLabel(row: RankSnapshotRow): string {
  if (!row.capturedAt) return row.localDate;
  const time = new Date(row.capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${row.localDate} ${time}`;
}

export default function SnapshotHistoryTable({ rows, selectedId, onSelect }: Props) {
  if (rows.length === 0) {
    return <p style={{ color: "#64748b", margin: 0 }}>No snapshots for this query yet.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            <th style={thStyle}>Date</th>
            <th style={thStyle}>Type</th>
            <th style={thStyle}>Position</th>
            <th style={thStyle}>Where</th>
            <th style={thStyle}>Proxy city</th>
            <th style={thStyle}>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row)}
              style={{
                cursor: row.hasImage ? "pointer" : "default",
                background: row.id === selectedId ? "#f1f5f9" : undefined,
              }}
            >
              <td style={cellStyle}>{whenLabel(row)}</td>
              <td style={cellStyle}>{kindLabels[row.kind]}</td>
              <td style={{ ...cellStyle, color: statusColors[row.status], fontWeight: 600 }}>
                {positionLabel(row)}
              </td>
              <td style={cellStyle}>
                {row.source === "organic" && row.serpPage
                  ? `Page ${row.serpPage}`
                  : placesSourceLabel(row.source ?? undefined) || "—"}
              </td>
              <td style={cellStyle}>{row.egressCity ?? "—"}</td>
              <td style={{ ...cellStyle, color: "#64748b" }}>{row.errorMessage ?? row.resultTitle ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
