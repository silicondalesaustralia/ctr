import type React from "react";

export const panelStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: 24,
  marginBottom: 16,
  boxShadow: "0 3px 8px #24294c03",
  overflow: "hidden",
  maxWidth: "100%",
};

export const urlStyle: React.CSSProperties = {
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

export const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#767d8e",
  margin: "4px 0 0",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  maxWidth: "100%",
  overflowX: "hidden",
};
