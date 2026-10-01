"use client";

import { useState } from "react";
import { apiGet } from "../../../lib/api";
import { base64JpegToObjectUrl } from "./snapshot-image-url";

interface Props {
  sessionId: string;
}

/** Opens the session's pre-click screenshot full size in a new tab (click there to zoom). */
export default function SessionSnapshotLink({ sessionId }: Props) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    // Open the tab synchronously so popup blockers allow it, then fill it once the image arrives.
    const tab = window.open("", "_blank");
    setOpening(true);
    setError(null);
    try {
      const data = await apiGet<{ imageBase64: string }>(`/sessions/${sessionId}/snapshot`);
      const url = base64JpegToObjectUrl(data.imageBase64);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Failed to load screenshot");
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={opening}
      title={error ?? "Open screenshot full size in a new tab"}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: error ? "#bf4352" : "#6155dc",
        cursor: opening ? "wait" : "pointer",
        textDecoration: "underline",
        font: "inherit",
      }}
    >
      {opening ? "Opening…" : error ? "Retry" : "View ↗"}
    </button>
  );
}
