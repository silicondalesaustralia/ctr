"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { base64JpegToObjectUrl } from "./snapshot-image-url";
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
    let objectUrl: string | null = null;
    apiGet<{ imageBase64: string }>(`/rank-snapshots/${snapshotId}/image`)
      .then((data) => {
        if (cancelled) return;
        objectUrl = base64JpegToObjectUrl(data.imageBase64);
        setSrc(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load image");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [snapshotId]);

  return (
    <figure style={{ margin: 0, display: "grid", gap: 8, minWidth: 0 }}>
      <figcaption style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <strong>{title}</strong>
          {src && (
            <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#6155dc" }}>
              Open full size ↗
            </a>
          )}
        </span>
        {snapshot && (
          <span style={{ color: statusColors[snapshot.status], fontWeight: 600 }}>
            {positionLabel(snapshot)} · {snapshot.localDate}
          </span>
        )}
      </figcaption>
      <div
        style={{
          border: "1px solid #e9ecf2",
          borderRadius: 8,
          maxHeight: 640,
          overflow: "auto",
          background: "#fafbfc",
          minHeight: 120,
        }}
      >
        {src ? (
          <a href={src} target="_blank" rel="noreferrer" title="Open full size in a new tab">
            <img
              src={src}
              alt={`${title} screenshot`}
              style={{ width: "100%", display: "block", cursor: "zoom-in" }}
            />
          </a>
        ) : (
          <p style={{ padding: 16, margin: 0, color: "#767d8e" }}>
            {error ?? (!snapshot ? "No snapshot yet" : snapshotId ? "Loading…" : snapshot.errorMessage ?? "No image")}
          </p>
        )}
      </div>
    </figure>
  );
}
