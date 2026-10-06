"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { panelStyle } from "./shared";
import type { RankSnapshotRow } from "./snapshot-types";
import { timelinePoints, type TimelinePoint } from "./timeline-points";

interface Props {
  campaignId: string;
  keyword: string;
}

const W = 640;
const H = 180;
const PAD_X = 28;
const TOP = 14;
const PLOT_H = 130;
const FLOOR_Y = TOP + PLOT_H + 10;

function describe(point: TimelinePoint): string {
  const rank = point.position === null ? "not found" : `#${point.position}`;
  const cities = point.total ? ` (found in ${point.found}/${point.total} cities)` : "";
  return `${point.localDate} ${point.kind}: ${rank}${cities}`;
}

/** Rank over time: baseline band, campaign-running span (daily checks) and follow-ups after stop. */
export default function RankTimeline({ campaignId, keyword }: Props) {
  const [rows, setRows] = useState<RankSnapshotRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<RankSnapshotRow[]>(`/campaigns/${campaignId}/rank-snapshots`)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load rank checks");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const points = timelinePoints(rows, keyword);
  const ranks = points.flatMap((point) => (point.position != null ? [point.position] : []));
  const best = ranks.length > 0 ? Math.min(...ranks) : 1;
  const worst = ranks.length > 0 ? Math.max(...ranks) : 10;
  const y = (rank: number) => (best === worst ? TOP + PLOT_H / 2 : TOP + ((rank - best) / (worst - best)) * PLOT_H);
  const x = (index: number) => (points.length > 1 ? PAD_X + (index * (W - 2 * PAD_X)) / (points.length - 1) : W / 2);

  const baselineRanks = points.filter((p) => p.kind === "baseline" && p.position != null).map((p) => p.position!);
  const dailyIdx = points.flatMap((point, index) => (point.kind === "daily" ? [index] : []));
  const plotted = points.map((point, index) => ({ point, cx: x(index), cy: point.position == null ? FLOOR_Y : y(point.position) }));
  const line = plotted.filter((entry) => entry.point.position != null && entry.point.kind !== "followup");

  return (
    <div style={{ ...panelStyle, marginBottom: 16, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Rank over time · “{keyword}”</h2>
      {error && <p style={{ color: "#bf4352", margin: 0, fontSize: 13 }}>{error}</p>}
      {points.length === 0 ? (
        <p style={{ margin: 0, color: "#767d8e" }}>No rank checks yet.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rank over ${points.length} checks`} style={{ width: "100%", height: "auto" }}>
          {dailyIdx.length > 0 && (
            <rect x={x(dailyIdx[0]!) - 6} y={4} width={x(dailyIdx[dailyIdx.length - 1]!) - x(dailyIdx[0]!) + 12} height={H - 8} fill="#6155dc" fillOpacity={0.07} rx={6}>
              <title>Campaign running</title>
            </rect>
          )}
          {baselineRanks.length > 0 && (
            <rect x={0} width={W} y={y(Math.min(...baselineRanks)) - 4} height={y(Math.max(...baselineRanks)) - y(Math.min(...baselineRanks)) + 8} fill="#198366" fillOpacity={0.12}>
              <title>Baseline range</title>
            </rect>
          )}
          <line x1={0} x2={W} y1={FLOOR_Y} y2={FLOOR_Y} stroke="#f0f1f6" />
          <text x={2} y={TOP + 4} fontSize={10} fill="#767d8e">#{best}</text>
          <text x={2} y={TOP + PLOT_H} fontSize={10} fill="#767d8e">#{worst}</text>
          <text x={2} y={FLOOR_Y - 3} fontSize={10} fill="#bf4352">Not found</text>
          {line.length > 1 && (
            <polyline points={line.map((e) => `${e.cx},${e.cy}`).join(" ")} fill="none" stroke="#6155dc" strokeWidth={2} strokeLinejoin="round" />
          )}
          {plotted.map(({ point, cx, cy }, index) =>
            point.kind === "followup" ? (
              <path key={index} d={`M${cx} ${cy - 6}L${cx + 6} ${cy}L${cx} ${cy + 6}L${cx - 6} ${cy}Z`} fill="#d68a12">
                <title>{describe(point)}</title>
              </path>
            ) : (
              <circle key={index} cx={cx} cy={cy} r={point.kind === "baseline" ? 5 : 3.5} fill={point.position == null ? "#fff" : point.kind === "baseline" ? "#198366" : "#6155dc"} stroke={point.position == null ? "#bf4352" : "none"}>
                <title>{describe(point)}</title>
              </circle>
            ),
          )}
        </svg>
      )}
      <p style={{ margin: 0, fontSize: 12, color: "#767d8e" }}>
        Green band: baseline range · shaded: campaign running · orange diamonds: follow-up checks after stop
      </p>
    </div>
  );
}
