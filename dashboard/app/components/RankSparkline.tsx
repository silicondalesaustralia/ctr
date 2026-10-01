const WIDTH = 90;
const HEIGHT = 36;
const PAD = 5;

interface RankSparklineProps {
  /** Rank per session, oldest first. */
  ranks: number[];
}

function trendColor(first: number, last: number): string {
  if (last < first) return "var(--green)";
  if (last > first) return "var(--red)";
  return "var(--accent)";
}

/** Rank per session: X is session number, Y is rank with #1 at the top. */
export default function RankSparkline({ ranks }: RankSparklineProps) {
  if (ranks.length === 0) {
    return <span style={{ color: "var(--muted)", fontSize: 11 }}>No ranks yet</span>;
  }

  const best = Math.min(...ranks);
  const worst = Math.max(...ranks);
  const span = Math.max(worst - best, 1);
  const stepX = ranks.length > 1 ? (WIDTH - PAD * 2) / (ranks.length - 1) : 0;
  const points = ranks.map((rank, index) => ({
    x: ranks.length > 1 ? PAD + index * stepX : WIDTH / 2,
    y: best === worst ? HEIGHT / 2 : PAD + ((rank - best) / span) * (HEIGHT - PAD * 2 - 3),
    rank,
    session: index + 1,
  }));
  const first = ranks[0]!;
  const last = ranks[ranks.length - 1]!;
  const color = trendColor(first, last);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Rank over ${ranks.length} sessions, best #${best}, worst #${worst}, latest #${last}`}
        style={{ overflow: "visible" }}
      >
        <title>{`Best #${best} · worst #${worst} over ${ranks.length} sessions`}</title>
        <path d={`M0 ${HEIGHT - 3}H${WIDTH}`} stroke="var(--line-soft)" />
        {points.length > 1 && (
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        )}
        {points.map((point, index) => (
          <circle
            key={point.session}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 3 : 2}
            fill={color}
          >
            <title>{`Session ${point.session}: #${point.rank}`}</title>
          </circle>
        ))}
      </svg>
      <strong style={{ fontSize: 17, fontWeight: 600, minWidth: 27, letterSpacing: -0.5, color }}>
        #{last}
      </strong>
    </div>
  );
}
