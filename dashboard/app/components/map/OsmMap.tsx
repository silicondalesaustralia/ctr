import type { ReactNode } from "react";
import { computeView, TILE_SIZE, visibleTiles, type MapView } from "./osm-tiles";

interface OsmMapProps {
  /** The map zooms to fit all of these. */
  fitPoints: { latitude: number; longitude: number }[];
  width?: number;
  height?: number;
  padding?: number;
  maxZoom?: number;
  label: string;
  /** SVG overlay drawn in map pixels; use toScreen(view, point) to place shapes. */
  children: (view: MapView) => ReactNode;
}

/** Static OpenStreetMap tiles with an SVG overlay; scales to its container width. */
export default function OsmMap({
  fitPoints,
  width = 640,
  height = 420,
  padding = 32,
  maxZoom = 15,
  label,
  children,
}: OsmMapProps) {
  const view = computeView(fitPoints, width, height, padding, maxZoom);
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: width }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        style={{ display: "block", width: "100%", height: "auto", borderRadius: 8, background: "#e8eaef" }}
      >
        {visibleTiles(view).map((tile) => (
          <image key={tile.key} href={tile.url} x={tile.x} y={tile.y} width={TILE_SIZE} height={TILE_SIZE} />
        ))}
        {children(view)}
      </svg>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        style={{
          position: "absolute",
          right: 4,
          bottom: 4,
          fontSize: 10,
          padding: "1px 4px",
          background: "rgba(255,255,255,0.85)",
          color: "#3b4252",
          borderRadius: 3,
          textDecoration: "none",
        }}
      >
        © OpenStreetMap contributors
      </a>
    </div>
  );
}
