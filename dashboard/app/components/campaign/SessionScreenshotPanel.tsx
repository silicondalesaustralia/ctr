"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import SessionRankSnapshotLink from "./SessionRankSnapshotLink";
import { base64JpegToObjectUrl } from "./snapshot-image-url";

interface Props {
  sessionId: string;
  hasSnapshot: boolean;
  campaignId: string;
  query: string;
  sessionAt: string;
  style: React.CSSProperties;
}

/** The SERP the session saw before clicking, plus the closest ranking snapshot for its query. */
export default function SessionScreenshotPanel({
  sessionId,
  hasSnapshot,
  campaignId,
  query,
  sessionAt,
  style,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    setError(null);
    if (!hasSnapshot) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    apiGet<{ imageBase64: string }>(`/sessions/${sessionId}/snapshot`)
      .then((data) => {
        if (cancelled) return;
        objectUrl = base64JpegToObjectUrl(data.imageBase64);
        setSrc(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load screenshot");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, hasSnapshot]);

  return (
    <div style={{ ...style, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Snapshots</h3>
        {src && (
          <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>
            Open session screenshot ↗
          </a>
        )}
      </div>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" title="Open full size in a new tab">
          <img
            src={src}
            alt="Search results the session saw before clicking"
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: 480,
              border: "1px solid var(--line)",
              borderRadius: 8,
              cursor: "zoom-in",
            }}
          />
        </a>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: error ? "var(--red)" : "var(--muted)" }}>
          {error ??
            (hasSnapshot
              ? "Loading session screenshot…"
              : "No session screenshot: the session didn't find the target, or ran before screenshots were added.")}
        </p>
      )}
      <SessionRankSnapshotLink campaignId={campaignId} query={query} sessionAt={sessionAt} />
    </div>
  );
}
