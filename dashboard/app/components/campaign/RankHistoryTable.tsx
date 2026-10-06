import type { TimelinePoint } from "./timeline-points";

interface Props {
  points: TimelinePoint[];
}

const KIND_LABELS: Record<TimelinePoint["kind"], string> = {
  baseline: "Baseline",
  daily: "Daily",
  manual: "Manual",
  followup: "Follow-up",
};

const cell = { padding: "6px 10px", borderBottom: "1px solid var(--line)", textAlign: "left" as const };

function changeCell(point: TimelinePoint, previous: TimelinePoint | undefined) {
  if (!previous) return { text: "—", color: "var(--muted)" };
  if (point.position === null) return { text: previous.position === null ? "—" : "▼ dropped out", color: "#bf4352" };
  if (previous.position === null) return { text: "▲ now ranking", color: "#198366" };
  const change = previous.position - point.position;
  if (change === 0) return { text: "No change", color: "var(--muted)" };
  return { text: `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}`, color: change > 0 ? "#198366" : "#bf4352" };
}

/** Every rank check, newest first, with the move since the check before it. */
export default function RankHistoryTable({ points }: Props) {
  const rows = points.map((point, index) => ({ point, change: changeCell(point, points[index - 1]) })).reverse();
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
      <thead>
        <tr style={{ color: "#767d8e" }}>
          <th style={cell}>Date</th>
          <th style={cell}>Check</th>
          <th style={cell}>Rank</th>
          <th style={cell}>Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ point, change }, index) => (
          <tr key={`${point.localDate}-${point.kind}-${index}`}>
            <td style={cell}>{point.localDate}</td>
            <td style={{ ...cell, color: "#767d8e" }}>{KIND_LABELS[point.kind]}</td>
            <td style={{ ...cell, fontWeight: 600 }}>
              {point.position === null ? "Not found" : `#${point.position}`}
              {point.total ? (
                <span style={{ fontWeight: 400, color: "#767d8e" }}> · {point.found}/{point.total} cities</span>
              ) : null}
            </td>
            <td style={{ ...cell, color: change.color }}>{change.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
