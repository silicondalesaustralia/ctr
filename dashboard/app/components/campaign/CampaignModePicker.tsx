"use client";

import { panelStyle, primaryButtonStyle, secondaryButtonStyle } from "./shared";

export type CampaignKindChoice = "url" | "gmb";

interface Props {
  onChoose: (kind: CampaignKindChoice) => void;
}

export default function CampaignModePicker({ onChoose }: Props) {
  return (
    <section style={panelStyle}>
      <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>New campaign</p>
      <h2 style={{ margin: "0 0 8px" }}>How do you want to target?</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 15 }}>
        URL campaigns click organic results into your website. GMB campaigns open the local pack /
        Maps listing and can tap Website, Directions, or Call.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <button
          type="button"
          onClick={() => onChoose("url")}
          style={{ ...primaryButtonStyle("#2563eb"), padding: "20px 16px", textAlign: "left" }}
        >
          <div style={{ fontSize: 16, marginBottom: 6 }}>Create via URL</div>
          <div style={{ fontWeight: 400, fontSize: 13, opacity: 0.9 }}>
            Organic SERP → your page · GSC-backed planning
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChoose("gmb")}
          style={{ ...secondaryButtonStyle(false), padding: "20px 16px", textAlign: "left" }}
        >
          <div style={{ fontSize: 16, marginBottom: 6 }}>Create for GMB</div>
          <div style={{ fontWeight: 400, fontSize: 13, color: "#64748b" }}>
            Local pack / Maps · city-scoped proxies & identities
          </div>
        </button>
      </div>
    </section>
  );
}
