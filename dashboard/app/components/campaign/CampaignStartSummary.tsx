"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { panelStyle } from "./shared";
import type { CampaignFormState, QueryRow } from "./shared";
import type { RankSnapshotRow } from "./snapshot-types";

interface Props {
  campaignId: string;
  form: CampaignFormState;
}

interface StartingRank {
  label: string;
  source: string;
}

function startingRank(row: QueryRow, baseline: RankSnapshotRow | undefined): StartingRank {
  if (baseline?.status === "captured" && baseline.position !== null) {
    return { label: `#${baseline.position}`, source: `baseline snapshot ${baseline.localDate}` };
  }
  if (baseline?.status === "not_found") {
    return { label: "Not found", source: `baseline snapshot ${baseline.localDate}` };
  }
  if (row.preflightPosition != null) return { label: `#${row.preflightPosition}`, source: "preflight check" };
  if (row.startingPosition != null) {
    return { label: `#${row.startingPosition.toFixed(1)}`, source: "Search Console avg" };
  }
  if (baseline?.status === "pending" || baseline?.status === "running") {
    return { label: "Pending", source: "baseline snapshot queued" };
  }
  return { label: "—", source: "no data yet" };
}

const termStyle = { color: "#767d8e", fontSize: 13, margin: 0 };
const valueStyle = { margin: "2px 0 0", fontWeight: 600, wordBreak: "break-all" as const };

export default function CampaignStartSummary({ campaignId, form }: Props) {
  const [baselines, setBaselines] = useState<RankSnapshotRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<RankSnapshotRow[]>(`/campaigns/${campaignId}/rank-snapshots`)
      .then((rows) => {
        if (!cancelled) setBaselines(rows.filter((row) => row.kind === "baseline"));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load baseline ranks");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const isGmb = form.campaignKind === "gmb";
  const queries = form.queries.filter((row) => row.active);

  return (
    <div style={{ ...panelStyle, marginBottom: 16, display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Campaign target</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {isGmb && (
          <div>
            <p style={termStyle}>Business name</p>
            <p style={valueStyle}>{form.gmbBusinessName || "—"}</p>
          </div>
        )}
        <div>
          <p style={termStyle}>{isGmb ? "Google Maps URL" : "Target URL"}</p>
          {(isGmb ? form.gmbMapsUrl : form.targetUrl) ? (
            <a
              href={isGmb ? form.gmbMapsUrl : form.targetUrl}
              target="_blank"
              rel="noreferrer"
              style={{ ...valueStyle, display: "block", color: "#6155dc" }}
            >
              {isGmb ? form.gmbMapsUrl : form.targetUrl}
            </a>
          ) : (
            <p style={valueStyle}>—</p>
          )}
        </div>
      </div>

      <div>
        <p style={termStyle}>Starting ranking</p>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
          {queries.map((row) => {
            const rank = startingRank(row, baselines.find((item) => item.query === row.text));
            return (
              <li key={row.text}>
                <strong>{rank.label}</strong> for “{row.text}”{" "}
                <span style={{ color: "#767d8e", fontSize: 13 }}>({rank.source})</span>
              </li>
            );
          })}
        </ul>
        {error && <p style={{ color: "#bf4352", margin: "6px 0 0", fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
