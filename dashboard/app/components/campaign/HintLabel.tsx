"use client";

import { useState } from "react";
import { labelStyle } from "./shared";

interface HintLabelProps {
  label: string;
  hint: string;
  inline?: boolean;
}

export default function HintLabel({ label, hint, inline = false }: HintLabelProps) {
  const [open, setOpen] = useState(false);

  const hintButton = (
    <span
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={hint}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#e2e8f0",
          color: "#475569",
          fontSize: 11,
          fontWeight: 700,
          cursor: "help",
          border: "none",
          padding: 0,
          lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 6px)",
            zIndex: 50,
            width: "max-content",
            maxWidth: 280,
            padding: "8px 10px",
            background: "#1e293b",
            color: "#f8fafc",
            fontSize: 13,
            lineHeight: 1.45,
            borderRadius: 6,
            fontWeight: 400,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.18)",
            whiteSpace: "normal",
            textAlign: "left",
          }}
        >
          {hint}
        </span>
      )}
    </span>
  );

  if (inline) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
        {label}
        {hintButton}
      </span>
    );
  }

  return (
    <span style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
      {label}
      {hintButton}
    </span>
  );
}
