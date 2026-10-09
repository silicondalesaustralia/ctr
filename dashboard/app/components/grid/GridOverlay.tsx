import { pixelsPerKm, toScreen, type MapView } from "../map/osm-tiles";
import { changeColor, changeText, rankChange, rankColor, rankText } from "./grid-colors";
import type { GridMode, GridPoint } from "./grid-types";

interface GridOverlayProps {
  view: MapView;
  mode: GridMode;
  fromPoints: GridPoint[];
  toPoints: GridPoint[];
  gridSize: number;
  spacingKm: number;
}

function key(point: { row: number; col: number }): string {
  return `${point.row}-${point.col}`;
}

function tooltip(mode: GridMode, from: GridPoint | undefined, to: GridPoint | undefined): string {
  const describe = (point: GridPoint | undefined) =>
    !point || point.status === "pending" || point.status === "running"
      ? "not checked yet"
      : point.status === "captured"
        ? `#${point.position ?? "?"}${point.source === "local_pack" ? " (3-pack)" : ""}`
        : point.status === "not_found"
          ? "not found"
          : point.status;
  const shown = mode === "before" ? from : to;
  const pack = shown?.topResults.length ? `\n3-pack: ${shown.topResults.join(", ")}` : "";
  const phone = shown?.mobileCheckedAt
    ? `\nPhone 3-pack: ${shown.mobilePackPosition ? `#${shown.mobilePackPosition}` : "not in it"}` +
      (shown.mobileTopResults.length ? ` (${shown.mobileTopResults.join(", ")})` : "")
    : "";
  if (mode === "change") return `Before ${describe(from)} → now ${describe(to)}${pack}${phone}`;
  return `${describe(shown)}${pack}${phone}`;
}

/** One coloured square per grid point; the centre (rank check location) is outlined. */
export default function GridOverlay({ view, mode, fromPoints, toPoints, gridSize, spacingKm }: GridOverlayProps) {
  const fromByKey = new Map(fromPoints.map((point) => [key(point), point]));
  const base = mode === "before" ? fromPoints : toPoints;
  const toByKey = new Map(toPoints.map((point) => [key(point), point]));
  const half = (gridSize - 1) / 2;
  const centreLat = base[0]?.latitude ?? 0;
  const side = Math.max(20, Math.min(56, spacingKm * pixelsPerKm(view, centreLat) * 0.72));

  return (
    <g>
      {base.map((point) => {
        const from = fromByKey.get(key(point));
        const to = toByKey.get(key(point));
        const change = rankChange(from, to);
        const fill = mode === "change" ? changeColor(change) : rankColor(mode === "before" ? from : to);
        const text = mode === "change" ? changeText(change) : rankText(mode === "before" ? from : to);
        const { x, y } = toScreen(view, point);
        const centre = point.row === half && point.col === half;
        const shown = mode === "before" ? from : to;
        return (
          <g key={point.id}>
            <title>{tooltip(mode, from, to)}</title>
            <rect
              x={x - side / 2}
              y={y - side / 2}
              width={side}
              height={side}
              rx={6}
              fill={fill}
              fillOpacity={0.88}
              stroke={centre ? "#1f2433" : "#fff"}
              strokeWidth={centre ? 3 : 1.5}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fff"
              fontSize={Math.round(side * 0.38)}
              fontWeight={700}
            >
              {text}
            </text>
            {shown?.mobilePackPosition != null && (
              <circle cx={x + side / 2 - 5} cy={y - side / 2 + 5} r={4} fill="#fff" stroke="#1f2433" strokeWidth={1.5} />
            )}
          </g>
        );
      })}
    </g>
  );
}
