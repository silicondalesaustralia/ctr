const WIDTH = 140;
const HEIGHT = 44;
const PAD = 5;
/** Room for the best/worst rank labels. */
const PAD_LEFT = 20;

interface RankSparklineProps {
  /** Rank per session, oldest first. */
  ranks: number[];
}

function trendColor(first: number, last: number): string {
  if (last < first) return "#16a34a";
  if (last > first) return "#dc2626";
  return "#2563eb";
}

/** Rank per session: X is session number, Y is rank with #1 at the top. */
export default function RankSparkline({ ranks }: RankSparklineProps) {
  if (ranks.length === 0) {
    return <span style={{ color: "#94a3b8", fontSize: 12 }}>No ranks yet</span>;
  }

  const best = Math.min(...ranks);
  const worst = Math.max(...ranks);
  const span = Math.max(worst - best, 1);
  const stepX = ranks.length > 1 ? (WIDTH - PAD_LEFT - PAD) / (ranks.length - 1) : 0;
  const points = ranks.map((rank, index) => ({
    x: ranks.length > 1 ? PAD_LEFT + index * stepX : (WIDTH + PAD_LEFT) / 2,
    y: PAD + ((rank - best) / span) * (HEIGHT - PAD * 2),
    rank,
    session: index + 1,
  }));
  const first = ranks[0]!;
  const last = ranks[ranks.length - 1]!;
  const color = trendColor(first, last);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Rank over ${ranks.length} sessions, latest #${last}`}
        style={{ background: "#f8fafc", borderRadius: 4 }}
      >
        <text x={2} y={9} fontSize={8} fill="#94a3b8">#{best}</text>
        <text x={2} y={HEIGHT - 2} fontSize={8} fill="#94a3b8">#{worst}</text>
        {points.length > 1 && (
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
        )}
        {points.map((point) => (
          <circle key={point.session} cx={point.x} cy={point.y} r={2.2} fill={color}>
            <title>{`Session ${point.session}: #${point.rank}`}</title>
          </circle>
        ))}
      </svg>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>#{last}</span>
    </div>
  );
}
