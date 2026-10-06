import { rankSourceLabel, type RankPoint } from "./campaigns/campaign-list-types";

const WIDTH = 90;
const HEIGHT = 36;
const NOT_FOUND_Y = 31;

interface RankSparklineProps {
  /** One rank check per point, oldest first. */
  points: RankPoint[];
}

function trendColor(first: number, last: number): string {
  if (last < first) return "#32967b";
  if (last > first) return "#bf4352";
  return "#8176d8";
}

function pointLabel(point: RankPoint): string {
  const when = point.localDate;
  if (point.position === null) return `${when}: not found`;
  const source = rankSourceLabel(point.source);
  return `${when}: ${source ? `${source} ` : ""}#${point.position}`;
}

/** Rank per daily/manual check: X is check order, Y is rank with #1 at the top; not found sits on the floor. */
export default function RankSparkline({ points }: RankSparklineProps) {
  if (points.length === 0) {
    return <span style={{ color: "var(--muted)", fontSize: 11 }}>No rank checks yet</span>;
  }

  const ranks = points.map((point) => point.position).filter((rank): rank is number => rank !== null);
  const best = ranks.length > 0 ? Math.min(...ranks) : 1;
  const worst = ranks.length > 0 ? Math.max(...ranks) : 1;
  const plotted = points.map((point, index) => ({
    x: points.length > 1 ? 3 + (index * 84) / (points.length - 1) : 45,
    y:
      point.position === null
        ? NOT_FOUND_Y
        : best === worst
          ? 18
          : 5 + ((point.position - best) / (worst - best)) * 22,
    point,
  }));
  const latest = points[points.length - 1]!;
  const color =
    ranks.length > 0 ? trendColor(ranks[0]!, ranks[ranks.length - 1]!) : "var(--muted)";
  const ranked = plotted.filter((entry) => entry.point.position !== null);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Rank over ${points.length} checks, latest ${pointLabel(latest)}`}
        style={{ overflow: "visible" }}
      >
        <title>{ranks.length > 0 ? `Best #${best} · worst #${worst} over ${points.length} checks` : "Not found in any check"}</title>
        <path d="M0 33H90" stroke="#f0f1f6" />
        {ranked.length > 1 && (
          <polyline
            points={ranked.map((entry) => `${entry.x},${entry.y}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        )}
        {plotted.map((entry, index) => (
          <circle
            key={`${entry.point.localDate}-${index}`}
            cx={entry.x}
            cy={entry.y}
            r={index === plotted.length - 1 ? 3 : 2}
            fill={entry.point.position === null ? "#fff" : color}
            stroke={entry.point.position === null ? "#bf4352" : "none"}
          >
            <title>{pointLabel(entry.point)}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 27 }}>
        <strong style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.5, color }}>
          {latest.position === null ? "—" : `#${latest.position}`}
        </strong>
        <small style={{ fontSize: 10, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {latest.position === null ? "Not found" : rankSourceLabel(latest.source)}
        </small>
      </div>
    </div>
  );
}
