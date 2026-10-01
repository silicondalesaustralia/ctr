"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { base64JpegToObjectUrl } from "./snapshot-image-url";

interface Props {
  sessionId: string;
  hasSnapshot: boolean;
  style: React.CSSProperties;
}

/** The SERP the session saw when it found the target, captured just before clicking. */
export default function SessionScreenshotPanel({ sessionId, hasSnapshot, style }: Props) {
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
    <div style={style}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Screenshot before click</h3>
        {src && (
          <a href={src} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#2563eb" }}>
            Open full size ↗
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
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              cursor: "zoom-in",
            }}
          />
        </a>
      ) : (
        <p style={{ margin: 0, color: error ? "#b91c1c" : "#64748b" }}>
          {error ?? (hasSnapshot ? "Loading…" : "No screenshot — the session didn't find the target, or ran before screenshots were added.")}
        </p>
      )}
    </div>
  );
}
