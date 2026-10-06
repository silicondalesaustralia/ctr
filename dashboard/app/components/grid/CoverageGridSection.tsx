"use client";

import { useState } from "react";
import OsmMap from "../map/OsmMap";
import BlobImageLink from "../campaign/BlobImageLink";
import { panelStyle } from "../campaign/shared";
import { GRID_AMBER, GRID_GREEN, GRID_GREY, GRID_RED } from "./grid-colors";
import GridHistoryTable from "./GridHistoryTable";
import GridOverlay from "./GridOverlay";
import GridScanControls from "./GridScanControls";
import GridSummaryCards from "./GridSummaryCards";
import { isScanOpen, type GridMode } from "./grid-types";
import { useGeoGrids, useGridPoints } from "./useGeoGrids";

interface Props {
  campaignId: string;
}

const RANK_LEGEND = [
  { color: GRID_GREEN, label: "1-3" },
  { color: GRID_AMBER, label: "4-10" },
  { color: GRID_RED, label: "11+ / not found" },
  { color: GRID_GREY, label: "Not checked" },
];
const CHANGE_LEGEND = [
  { color: GRID_GREEN, label: "Improved" },
  { color: GRID_RED, label: "Dropped" },
  { color: GRID_GREY, label: "No change" },
];

/** GMB coverage grid: rank at each point around the rank check location, before vs latest. */
export default function CoverageGridSection({ campaignId }: Props) {
  const { scans, error, loading, queueing, runNow, open } = useGeoGrids(campaignId);
  const [pickedQuery, setPickedQuery] = useState("");
  const [pickedFrom, setPickedFrom] = useState("");
  const [pickedTo, setPickedTo] = useState("");
  const [mode, setMode] = useState<GridMode>("latest");

  const queries = [...new Set(scans.map((scan) => scan.query))];
  const query = queries.includes(pickedQuery) ? pickedQuery : (queries[0] ?? "");
  const queryScans = scans.filter((scan) => scan.query === query);
  const defaultFrom = queryScans.find((scan) => scan.kind === "baseline") ?? queryScans[queryScans.length - 1];
  const fromScan = queryScans.find((scan) => scan.id === pickedFrom) ?? defaultFrom;
  const toScan = queryScans.find((scan) => scan.id === pickedTo) ?? queryScans[0];
  const from = useGridPoints(fromScan);
  const to = useGridPoints(toScan);

  const shownScan = mode === "before" ? fromScan : toScan;
  const shownPoints = mode === "before" ? from.points : to.points;
  const legend = mode === "change" ? CHANGE_LEGEND : RANK_LEGEND;
  const openScan = queryScans.find(isScanOpen);
  const done = openScan ? (mode === "before" ? from.points : to.points).filter((p) => p.status !== "pending").length : 0;

  return (
    <div id="coverage-grid" style={{ ...panelStyle, marginBottom: 16, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Coverage grid</h2>
          <p style={{ margin: "4px 0 0", color: "#767d8e", fontSize: 13 }}>
            Rank from each point around the rank check location (outlined centre square).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={queueing || open}
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            font: "inherit",
            fontWeight: 600,
            cursor: queueing || open ? "default" : "pointer",
            opacity: queueing || open ? 0.6 : 1,
          }}
        >
          {queueing ? "Queueing…" : open ? "Grid running…" : "Run grid now"}
        </button>
      </div>

      {error && <p style={{ color: "#bf4352", margin: 0, fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ margin: 0, color: "#767d8e" }}>Loading coverage grids…</p>}
      {!loading && scans.length === 0 && (
        <p style={{ margin: 0, color: "#767d8e" }}>
          No grid scans yet. A baseline runs when the campaign starts, then weekly overnight.
        </p>
      )}

      {queryScans.length > 0 && (
        <>
          <GridScanControls
            queries={queries}
            query={query}
            onQuery={setPickedQuery}
            scans={queryScans}
            fromId={fromScan?.id ?? ""}
            toId={toScan?.id ?? ""}
            onFrom={setPickedFrom}
            onTo={setPickedTo}
            mode={mode}
            onMode={setMode}
          />
          <GridSummaryCards fromScan={fromScan} toScan={toScan} fromPoints={from.points} toPoints={to.points} />
          {openScan && (
            <p style={{ margin: 0, fontSize: 13, color: "#6155dc" }}>
              Scan in progress{shownScan?.id === openScan.id ? ` · ${done}/${openScan.pointCount} points checked` : ""}
            </p>
          )}
          {shownPoints.length > 0 && shownScan && (
            <OsmMap fitPoints={shownPoints} label={`Coverage grid for ${query}`}>
              {(view) => (
                <GridOverlay
                  view={view}
                  mode={mode}
                  fromPoints={from.points}
                  toPoints={to.points}
                  gridSize={shownScan.gridSize}
                  spacingKm={shownScan.spacingKm}
                />
              )}
            </OsmMap>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "#767d8e", alignItems: "center" }}>
            {legend.map((item) => (
              <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                {item.label}
              </span>
            ))}
            {shownScan?.hasImage && (
              <BlobImageLink imagePath={`/geo-grids/${shownScan.id}/image`} label="Centre results page ↗" />
            )}
          </div>
          {(from.error || to.error) && <p style={{ color: "#bf4352", margin: 0, fontSize: 13 }}>{from.error ?? to.error}</p>}
          <GridHistoryTable scans={queryScans} />
        </>
      )}
    </div>
  );
}
