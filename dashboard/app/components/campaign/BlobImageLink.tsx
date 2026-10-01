"use client";

import { useState } from "react";
import { apiGet } from "../../../lib/api";
import { base64JpegToObjectUrl } from "./snapshot-image-url";

interface Props {
  /** API path returning `{ imageBase64 }`. */
  imagePath: string;
  label?: string;
}

/** Opens a stored JPEG full size in a new tab as a blob: URL (click there to zoom). */
export default function BlobImageLink({ imagePath, label = "View ↗" }: Props) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    // Open the tab synchronously so popup blockers allow it, then fill it once the image arrives.
    const tab = window.open("", "_blank");
    setOpening(true);
    setError(null);
    try {
      const data = await apiGet<{ imageBase64: string }>(imagePath);
      const url = base64JpegToObjectUrl(data.imageBase64);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Failed to load image");
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={opening}
      title={error ?? "Open full size in a new tab"}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: error ? "var(--red)" : "var(--accent)",
        cursor: opening ? "wait" : "pointer",
        textDecoration: "underline",
        font: "inherit",
        fontWeight: 600,
      }}
    >
      {opening ? "Opening…" : error ? "Retry" : label}
    </button>
  );
}
