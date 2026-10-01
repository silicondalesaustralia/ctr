"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { positionLabel, statusColors, type RankSnapshotRow } from "./snapshot-types";

interface Props {
  title: string;
  snapshot: RankSnapshotRow | null;
}

export default function SnapshotImage({ title, snapshot }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshotId = snapshot?.hasImage ? snapshot.id : null;

  useEffect(() => {
    setSrc(null);
    setError(null);
    if (!snapshotId) return;
    let cancelled = false;
    apiGet<{ imageBase64: string }>(`/rank-snapshots/${snapshotId}/image`)
      .then((data) => {
        if (!cancelled) setSrc(`data:image/jpeg;base64,${data.imageBase64}`);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load image");
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  return (
    <figure style={{ margin: 0, display: "grid", gap: 8, minWidth: 0 }}>
      <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{title}</strong>
        {snapshot && (
          <span style={{ color: statusColors[snapshot.status], fontWeight: 600 }}>
            {positionLabel(snapshot)} · {snapshot.localDate}
          </span>
        )}
      </figcaption>
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          maxHeight: 640,
          overflow: "auto",
          background: "#f8fafc",
          minHeight: 120,
        }}
      >
        {src ? (
          <a href={src} target="_blank" rel="noreferrer">
            <img src={src} alt={`${title} screenshot`} style={{ width: "100%", display: "block" }} />
          </a>
        ) : (
          <p style={{ padding: 16, margin: 0, color: "#64748b" }}>
            {error ?? (!snapshot ? "No snapshot yet" : snapshotId ? "Loading…" : snapshot.errorMessage ?? "No image")}
          </p>
        )}
      </div>
    </figure>
  );
}
