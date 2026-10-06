import { GRID_GREEN, GRID_GREY, GRID_RED, pointRank, NOT_FOUND_RANK } from "./grid-colors";
import type { GridPoint, GridScan } from "./grid-types";

interface GridSummaryCardsProps {
  fromScan: GridScan | undefined;
  toScan: GridScan | undefined;
  fromPoints: GridPoint[];
  toPoints: GridPoint[];
}

interface Card {
  title: string;
  from: string;
  to: string;
  /** Positive = better. */
  delta: number | null;
  deltaText: string;
}

function centreRank(scan: GridScan | undefined, points: GridPoint[]): number | null {
  if (!scan) return null;
  const half = (scan.gridSize - 1) / 2;
  return pointRank(points.find((point) => point.row === half && point.col === half));
}

function rankLabel(rank: number | null): string {
  if (rank === null) return "—";
  return rank >= NOT_FOUND_RANK ? "Not found" : `#${rank}`;
}

function signed(value: number, digits = 0): string {
  const text = Math.abs(value).toFixed(digits);
  return value > 0 ? `▲ ${text}` : value < 0 ? `▼ ${text}` : "No change";
}

function buildCards({ fromScan, toScan, fromPoints, toPoints }: GridSummaryCardsProps): Card[] {
  const fromCentre = centreRank(fromScan, fromPoints);
  const toCentre = centreRank(toScan, toPoints);
  const centreDelta = fromCentre !== null && toCentre !== null ? fromCentre - toCentre : null;
  const fromPack = fromScan?.inPackCount ?? null;
  const toPack = toScan?.inPackCount ?? null;
  const packDelta = fromPack !== null && toPack !== null ? toPack - fromPack : null;
  const fromAvg = fromScan?.avgRank ?? null;
  const toAvg = toScan?.avgRank ?? null;
  const avgDelta = fromAvg !== null && toAvg !== null ? Number((fromAvg - toAvg).toFixed(1)) : null;
  return [
    {
      title: "Rank from check location",
      from: rankLabel(fromCentre),
      to: rankLabel(toCentre),
      delta: centreDelta,
      deltaText: centreDelta === null ? "" : signed(centreDelta),
    },
    {
      title: "Points in the 3-pack",
      from: fromPack === null ? "—" : `${fromPack}/${fromScan?.pointCount ?? 0}`,
      to: toPack === null ? "—" : `${toPack}/${toScan?.pointCount ?? 0}`,
      delta: packDelta,
      deltaText: packDelta === null ? "" : signed(packDelta),
    },
    {
      title: "Average grid rank",
      from: fromAvg === null ? "—" : fromAvg.toFixed(1),
      to: toAvg === null ? "—" : toAvg.toFixed(1),
      delta: avgDelta,
      deltaText: avgDelta === null ? "" : signed(avgDelta, 1),
    },
  ];
}

/** "From → to" for the headline numbers, with the change coloured. */
export default function GridSummaryCards(props: GridSummaryCardsProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      {buildCards(props).map((card) => (
        <div key={card.title} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
          <p style={{ margin: 0, color: "#767d8e", fontSize: 12 }}>{card.title}</p>
          <p style={{ margin: "4px 0 0", fontWeight: 600, fontSize: 16 }}>
            {card.from} → {card.to}
          </p>
          {card.deltaText && (
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: card.delta === null || card.delta === 0 ? GRID_GREY : card.delta > 0 ? GRID_GREEN : GRID_RED,
              }}
            >
              {card.deltaText}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
