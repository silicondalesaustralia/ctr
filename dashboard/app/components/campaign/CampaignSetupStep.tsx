"use client";

import type { RegionOption } from "./shared";
import { inputStyle, labelStyle, panelStyle, primaryButtonStyle } from "./shared";

interface Props {
  keyword: string;
  targetUrl: string;
  region: string;
  regions: RegionOption[];
  busy: boolean;
  onKeywordChange: (value: string) => void;
  onTargetUrlChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onAnalyze: () => void;
}

export default function CampaignSetupStep({
  keyword,
  targetUrl,
  region,
  regions,
  busy,
  onKeywordChange,
  onTargetUrlChange,
  onRegionChange,
  onAnalyze,
}: Props) {
  const canAnalyze = Boolean(keyword.trim() && targetUrl.trim() && region);

  return (
    <section style={panelStyle}>
      <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>Step 1 of 2</p>
      <h2 style={{ margin: "0 0 8px" }}>Target page</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 15 }}>
        Enter your keyword, URL, and region. We fetch Google Search Console data for that page
        and recommend campaign settings you can review before starting.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <label>
          <span style={labelStyle}>Keyword</span>
          <input
            style={inputStyle}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="e.g. womens breeches"
          />
        </label>

        <label>
          <span style={labelStyle}>Target URL</span>
          <input
            style={inputStyle}
            type="url"
            value={targetUrl}
            onChange={(e) => onTargetUrlChange(e.target.value)}
            placeholder="https://www.example.com.au/page"
          />
        </label>

        <label>
          <span style={labelStyle}>Region</span>
          <select
            style={inputStyle}
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
          >
            {regions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={busy || !canAnalyze}
        style={{ ...primaryButtonStyle("#2563eb"), marginTop: 24 }}
      >
        {busy ? "Fetching GSC & building plan..." : "Analyze & recommend settings"}
      </button>
    </section>
  );
}
