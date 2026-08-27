"use client";

import { labelStyle } from "./shared";

interface HintLabelProps {
  label: string;
  hint: string;
  inline?: boolean;
}

export default function HintLabel({ label, hint, inline = false }: HintLabelProps) {
  return (
    <span
      style={{
        ...(inline ? { fontWeight: 600 } : labelStyle),
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      <span
        title={hint}
        aria-label={hint}
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
          flexShrink: 0,
        }}
      >
        ?
      </span>
    </span>
  );
}
