"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../../lib/api";
import SnapshotHistoryTable from "./SnapshotHistoryTable";
import SnapshotImage from "./SnapshotImage";
import { panelStyle, primaryButtonStyle, secondaryButtonStyle } from "./shared";
import type { RankSnapshotRow } from "./snapshot-types";

interface Props {
  campaignId: string;
}

export default function CampaignSnapshotsTab({ campaignId }: Props) {
  const [rows, setRows] = useState<RankSnapshotRow[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiGet<RankSnapshotRow[]>(`/campaigns/${campaignId}/rank-snapshots`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snapshots");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const takeSnapshot = useCallback(async () => {
    setQueueing(true);
    try {
      const result = await apiPost<{ queued: number }>(`/campaigns/${campaignId}/rank-snapshots`);
      setMessage(
        result.queued > 0
          ? `Queued ${result.queued} snapshot(s). The worker picks them up within a minute, after any running session.`
          : "Today's manual snapshots are already queued.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue snapshots");
    } finally {
      setQueueing(false);
    }
  }, [campaignId, load]);

  const queries = useMemo(() => Array.from(new Set(rows.map((row) => row.query))), [rows]);
  const activeQuery = query && queries.includes(query) ? query : (queries[0] ?? null);
  const queryRows = rows.filter((row) => row.query === activeQuery);
  const baseline = queryRows.find((row) => row.kind === "baseline") ?? null;
  const latest = queryRows.find((row) => row.kind !== "baseline" && row.hasImage) ?? null;
  const selected = queryRows.find((row) => row.id === selectedId) ?? null;

  return (
    <div style={{ ...panelStyle, display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Ranking snapshots</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            Baseline when the campaign starts, then one screenshot per query at the end of each day.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={secondaryButtonStyle(loading)} disabled={loading} onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            style={primaryButtonStyle("#0f172a", queueing)}
            disabled={queueing}
            onClick={() => void takeSnapshot()}
          >
            {queueing ? "Queueing…" : "Take snapshot now"}
          </button>
        </div>
      </div>

      {message && <p style={{ margin: 0, color: "#15803d" }}>{message}</p>}
      {error && <p style={{ margin: 0, color: "#b91c1c" }}>{error}</p>}

      {queries.length > 1 && (
        <select
          value={activeQuery ?? ""}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedId(null);
          }}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1", maxWidth: 420 }}
        >
          {queries.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      )}

      {!loading && queries.length === 0 ? (
        <p style={{ margin: 0, color: "#64748b" }}>
          No snapshots yet. A baseline is taken automatically when the campaign is running, or use
          “Take snapshot now”.
        </p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            <SnapshotImage title="Baseline" snapshot={baseline} />
            <SnapshotImage title={selected ? "Selected" : "Latest"} snapshot={selected ?? latest} />
          </div>
          <SnapshotHistoryTable
            rows={queryRows}
            selectedId={selectedId}
            onSelect={(row) => setSelectedId(row.hasImage ? row.id : null)}
          />
        </>
      )}
    </div>
  );
}
