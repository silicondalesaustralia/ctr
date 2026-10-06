interface Props {
  /** Positive = better. Null = nothing to compare against. */
  change: number | null;
  unit?: string;
  suffix: string;
}

/** "▲ 3 since last check" in green, red when it dropped. */
export default function RankChange({ change, unit = "", suffix }: Props) {
  if (change === null) return <small style={{ fontSize: 11, color: "var(--muted)" }}>First check</small>;
  const color = change > 0 ? "#198366" : change < 0 ? "#bf4352" : "var(--muted)";
  const text = change === 0 ? "No change" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}${unit}`;
  return (
    <small style={{ fontSize: 11, color, whiteSpace: "nowrap" }}>
      {text} <span style={{ color: "var(--muted)" }}>{suffix}</span>
    </small>
  );
}
