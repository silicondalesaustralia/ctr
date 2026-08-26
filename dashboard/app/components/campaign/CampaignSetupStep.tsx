"use client";

import Link from "next/link";
import type { RegionOption } from "./shared";
import { inputStyle, labelStyle, panelStyle, primaryButtonStyle, secondaryButtonStyle } from "./shared";

export interface GscConnectionOption {
  id: string;
  label: string;
  googleEmail: string | null;
}

export interface GscSiteOption {
  siteUrl: string;
  permissionLevel: string;
}

interface Props {
  keyword: string;
  targetUrl: string;
  region: string;
  gscConnectionId: string | null;
  gscSiteUrl: string | null;
  regions: RegionOption[];
  connections: GscConnectionOption[];
  sites: GscSiteOption[];
  sitesLoading: boolean;
  busy: boolean;
  onKeywordChange: (value: string) => void;
  onTargetUrlChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onGscConnectionChange: (value: string | null) => void;
  onGscSiteChange: (value: string | null) => void;
  onAnalyze: () => void;
}

export default function CampaignSetupStep({
  keyword,
  targetUrl,
  region,
  gscConnectionId,
  gscSiteUrl,
  regions,
  connections,
  sites,
  sitesLoading,
  busy,
  onKeywordChange,
  onTargetUrlChange,
  onRegionChange,
  onGscConnectionChange,
  onGscSiteChange,
  onAnalyze,
}: Props) {
  const canAnalyze = Boolean(keyword.trim() && targetUrl.trim() && region);

  return (
    <section style={panelStyle}>
      <p style={{ color: "#64748b", margin: "0 0 8px", fontSize: 14 }}>Step 1 of 2</p>
      <h2 style={{ margin: "0 0 8px" }}>Target page</h2>
      <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 15 }}>
        Enter your keyword, URL, and region. Pick a GSC account and property to pull live search data,
        then analyze to get recommended campaign settings.
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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

          <label>
            <span style={labelStyle}>GSC account</span>
            <select
              style={inputStyle}
              value={gscConnectionId ?? ""}
              onChange={(e) => onGscConnectionChange(e.target.value || null)}
            >
              <option value="">No GSC (keyword variations only)</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.googleEmail ?? connection.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {gscConnectionId && (
          <label>
            <span style={labelStyle}>GSC property</span>
            <select
              style={inputStyle}
              value={gscSiteUrl ?? ""}
              onChange={(e) => onGscSiteChange(e.target.value || null)}
              disabled={sitesLoading}
            >
              <option value="">
                {sitesLoading ? "Loading properties..." : "Select a property"}
              </option>
              {sites.map((site) => (
                <option key={site.siteUrl} value={site.siteUrl}>
                  {site.siteUrl}
                </option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/gsc" style={{ color: "#2563eb", fontSize: 14 }}>
            Manage GSC accounts
          </Link>
          {gscConnectionId && !gscSiteUrl && !sitesLoading && (
            <span style={{ color: "#b45309", fontSize: 14 }}>
              Select a property to use live GSC data.
            </span>
          )}
        </div>
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
