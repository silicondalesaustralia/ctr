"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { panelStyle } from "../campaign/shared";
import { GRID_AMBER, GRID_GREEN, GRID_GREY, GRID_RED } from "../grid/grid-colors";
import OsmMap from "../map/OsmMap";
import { toScreen } from "../map/osm-tiles";
import { panelChange, panelRankText, type NationalPanel, type PanelRank } from "./national-types";

interface Props {
  campaignId: string;
  keyword: string;
}

function markerColor(rank: PanelRank | null): string {
  if (!rank) return GRID_GREY;
  if (rank.status !== "captured" || rank.position == null) return GRID_RED;
  if (rank.position <= 3) return GRID_GREEN;
  return rank.position <= 10 ? GRID_AMBER : GRID_RED;
}

const cell = { padding: "6px 10px", borderBottom: "1px solid var(--line)", textAlign: "left" as const };

/** National URL campaigns: rank from each of the country's biggest cities, plus the national average. */
export default function NationalPanelSection({ campaignId, keyword }: Props) {
  const [panel, setPanel] = useState<NationalPanel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<NationalPanel>(`/campaigns/${campaignId}/national-panel?keyword=${encodeURIComponent(keyword)}`)
      .then((data) => {
        if (!cancelled) setPanel(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load city panel");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, keyword]);

  if (!error && (!panel || !panel.national || panel.cities.length === 0)) return null;
  const average = panel?.average;

  return (
    <div style={{ ...panelStyle, marginBottom: 16, display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18 }}>National city panel</h2>
        <p style={{ margin: "4px 0 0", color: "#767d8e", fontSize: 13 }}>
          “{keyword}” checked from each major city. National average:{" "}
          <strong>{average?.latest != null ? `#${average.latest}` : "—"}</strong>
          {average ? ` · found in ${average.found}/${average.total} cities` : ""}
          {average?.baseline != null ? ` · baseline avg #${average.baseline}` : ""}
        </p>
      </div>
      {error && <p style={{ color: "#bf4352", margin: 0, fontSize: 13 }}>{error}</p>}
      {panel && panel.cities.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
          <OsmMap fitPoints={panel.cities} maxZoom={6} height={360} padding={40} label="Rank by city">
            {(view) =>
              panel.cities.map((city) => {
                const { x, y } = toScreen(view, city);
                return (
                  <g key={city.city}>
                    <title>{`${city.city}: ${panelRankText(city.latest)}`}</title>
                    <circle cx={x} cy={y} r={16} fill={markerColor(city.latest)} stroke="#fff" strokeWidth={2} />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={11} fontWeight={700}>
                      {city.latest?.position ?? "–"}
                    </text>
                    <text x={x} y={y + 28} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1f2433" stroke="#fff" strokeWidth={3} paintOrder="stroke">
                      {city.city}
                    </text>
                  </g>
                );
              })
            }
          </OsmMap>
          <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
            <thead>
              <tr style={{ color: "#767d8e" }}>
                <th style={cell}>City</th>
                <th style={cell}>Rank</th>
                <th style={cell}>Since baseline</th>
                <th style={cell}>Checked</th>
              </tr>
            </thead>
            <tbody>
              {panel.cities.map((city) => {
                const change = panelChange(city);
                return (
                  <tr key={city.city}>
                    <td style={cell}>{city.city}</td>
                    <td style={{ ...cell, fontWeight: 600 }}>{panelRankText(city.latest)}</td>
                    <td style={{ ...cell, color: change === null || change === 0 ? GRID_GREY : change > 0 ? GRID_GREEN : GRID_RED }}>
                      {change === null ? "—" : change === 0 ? "No change" : change > 0 ? `▲ ${change}` : `▼ ${-change}`}
                    </td>
                    <td style={{ ...cell, color: "#767d8e" }}>{city.latest?.localDate ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
