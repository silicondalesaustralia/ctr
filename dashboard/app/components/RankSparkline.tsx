const WIDTH = 90;
const HEIGHT = 36;

interface RankSparklineProps {
  /** Rank per session, oldest first. */
  ranks: number[];
}

function trendColor(first: number, last: number): string {
  if (last < first) return "#32967b";
  if (last > first) return "#bf4352";
  return "#8176d8";
}

/** Rank per session: X is session number, Y is rank with #1 at the top. */
export default function RankSparkline({ ranks }: RankSparklineProps) {
  if (ranks.length === 0) {
    return <span style={{ color: "var(--muted)", fontSize: 11 }}>No ranks yet</span>;
  }

  const best = Math.min(...ranks);
  const worst = Math.max(...ranks);
  const points = ranks.map((rank, index) => ({
    x: ranks.length > 1 ? 3 + (index * 84) / (ranks.length - 1) : 45,
    y: best === worst ? 18 : 5 + ((rank - best) / (worst - best)) * 26,
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
        <path d="M0 33H90" stroke="#f0f1f6" />
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
