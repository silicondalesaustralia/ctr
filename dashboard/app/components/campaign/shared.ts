import type React from "react";

export type CampaignTab = "plan" | "sessions" | "identities";

export interface RegionOption {
  code: string;
  label: string;
}

export interface QueryRow {
  text: string;
  type: string;
  weight: number;
  active: boolean;
  monthlySearchVolume: number | null;
  startingPosition: number | null;
  gscImpressions28d: number | null;
  gscClicks28d: number | null;
  allocatedSessions: number | null;
  preflightFound?: boolean;
  preflightSerpPage?: number | null;
  preflightPosition?: number | null;
  preflightStatus?: string;
}

export interface PreflightSummary {
  status: "complete" | "none_found" | "blocked" | "error";
  testedCount: number;
  findableCount: number;
  keywordAdjusted: boolean;
  previousKeyword: string;
  results: Array<{
    query: string;
    found: boolean;
    serpPage: number | null;
    position: number | null;
    globalPosition: number | null;
    status: string;
    errorMessage?: string;
  }>;
}

export interface SettingRationale {
  setting: string;
  value: string;
  reason: string;
}

export interface IntensitySummary {
  totalBaselineClicks: number;
  totalAllocatedSessions: number;
  suggestedIdentities: number;
  activeIdentityCount: number | null;
  identityDeficit: number | null;
  feasibleSessions: number | null;
  treatmentMultiplier: number;
}

export interface CampaignFormState {
  keyword: string;
  targetUrl: string;
  region: string;
  gscConnectionId: string | null;
  gscSiteUrl: string | null;
  campaignDurationDays: number;
  treatmentIntensity: string;
  adaptivePacing: boolean;
  recalculateEveryDays: number;
  maxShareOfSearchDemand: number;
  maxShareOfGscImpressions: number;
  desktopPercent: number;
  ctrSource: string;
  queries: QueryRow[];
  plannedSessionCap: number | null;
  targetIdentityCount: number | null;
  organicMaxSessionsPerIdentity: number;
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 15,
  boxSizing: "border-box",
};

export const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontWeight: 600,
};

export const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

export const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

export const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "white",
  cursor: "pointer",
  fontWeight: 600,
};

export function primaryButtonStyle(color: string): React.CSSProperties {
  return {
    padding: "10px 22px",
    borderRadius: 8,
    border: "none",
    background: color,
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };
}
