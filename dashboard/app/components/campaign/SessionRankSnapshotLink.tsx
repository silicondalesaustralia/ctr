"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import BlobImageLink from "./BlobImageLink";
import { positionLabel, type RankSnapshotRow } from "./snapshot-types";

interface Props {
  campaignId: string;
  query: string;
  sessionAt: string;
}

function closestTo(rows: RankSnapshotRow[], iso: string): RankSnapshotRow | null {
  const at = new Date(iso).getTime();
  let best: RankSnapshotRow | null = null;
  let bestGap = Infinity;
  for (const row of rows) {
    if (!row.capturedAt) continue;
    const gap = Math.abs(new Date(row.capturedAt).getTime() - at);
    if (gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  return best;
}

/** Links the ranking snapshot of the session's query taken closest to when the session ran. */
export default function SessionRankSnapshotLink({ campaignId, query, sessionAt }: Props) {
  const [snapshot, setSnapshot] = useState<RankSnapshotRow | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    apiGet<RankSnapshotRow[]>(`/campaigns/${campaignId}/rank-snapshots`)
      .then((rows) => {
        if (cancelled) return;
        const wanted = query.trim().toLowerCase();
        const withImage = rows.filter((row) => row.hasImage && row.query.trim().toLowerCase() === wanted);
        setSnapshot(closestTo(withImage, sessionAt));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, query, sessionAt]);

  if (state === "loading") return <p style={lineStyle}>Looking for a ranking snapshot…</p>;
  if (state === "error") return <p style={{ ...lineStyle, color: "var(--red)" }}>Couldn&apos;t load ranking snapshots.</p>;
  if (!snapshot?.capturedAt) {
    return <p style={lineStyle}>No ranking snapshot for “{query}” yet.</p>;
  }

  return (
    <p style={{ ...lineStyle, color: "var(--text)" }}>
      Ranking snapshot for “{query}” · {positionLabel(snapshot)} · captured{" "}
      {new Date(snapshot.capturedAt).toLocaleString()} ·{" "}
      <BlobImageLink imagePath={`/rank-snapshots/${snapshot.id}/image`} label="Open snapshot ↗" />
      {snapshot.hasSerpImage && (
        <>
          {" · "}
          <BlobImageLink imagePath={`/rank-snapshots/${snapshot.id}/image?view=serp`} label="Open results page ↗" />
        </>
      )}
    </p>
  );
}

const lineStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: "var(--muted)" };
