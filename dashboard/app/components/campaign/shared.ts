import type React from "react";

export type CampaignTab = "plan" | "sessions" | "identities";

export interface RegionOption {
  code: string;
  label: string;
  city?: string;
}

export type CampaignKind = "url" | "gmb";

export interface GmbActionFlags {
  website: boolean;
  directions: boolean;
  call: boolean;
}

export const DEFAULT_GMB_ACTIONS: GmbActionFlags = {
  website: true,
  directions: true,
  call: true,
};

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
  campaignKind: CampaignKind;
  keyword: string;
  targetUrl: string;
  region: string;
  focusCity: string;
  gmbBusinessName: string;
  gmbPlaceId: string;
  gmbMapsUrl: string;
  gmbActions: GmbActionFlags;
  gscConnectionId: string | null;
  gscSiteUrl: string | null;
  campaignDurationDays: number;
  scheduleTimezone: string;
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
  selectedIdentityIds: string[];
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

export const secondaryButtonBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "white",
  fontWeight: 600,
};

export function secondaryButtonStyle(disabled = false): React.CSSProperties {
  return {
    ...secondaryButtonBase,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

export function primaryButtonStyle(color: string, disabled = false): React.CSSProperties {
  return {
    padding: "10px 22px",
    borderRadius: 8,
    border: "none",
    background: color,
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    opacity: disabled ? 0.55 : 1,
  };
}

export function hasGscSignal(row: QueryRow): boolean {
  return (
    (row.gscImpressions28d ?? 0) > 0 ||
    (row.gscClicks28d ?? 0) > 0 ||
    row.startingPosition != null
  );
}

export function isQueryFindableLive(
  row: QueryRow,
  preflightSummary: PreflightSummary | null,
): boolean {
  if (row.preflightFound) return true;
  if (!preflightSummary) return false;
  const result = preflightSummary.results.find(
    (item) => item.query.toLowerCase() === row.text.toLowerCase(),
  );
  return result?.found === true;
}

export function hasLiveCheck(row: QueryRow, preflightSummary: PreflightSummary | null): boolean {
  if (hasGscSignal(row)) return true;
  if (row.preflightStatus) return true;
  if (!preflightSummary) return false;
  return preflightSummary.results.some(
    (item) => item.query.toLowerCase() === row.text.toLowerCase(),
  );
}

export function canScheduleQuery(
  row: QueryRow,
  preflightSummary: PreflightSummary | null,
): boolean {
  if (!row.active) return false;
  return hasGscSignal(row) || isQueryFindableLive(row, preflightSummary);
}

export function getStartCampaignBlockReason(
  form: CampaignFormState,
  preflightSummary: PreflightSummary | null,
  campaignStatus?: string | null,
): string | null {
  if (form.campaignKind === "gmb") {
    if (!form.keyword.trim() || !form.gmbMapsUrl.trim() || !form.focusCity) {
      return "Keyword, Maps URL, and geo city are required.";
    }
    const enabledQueries = form.queries.filter((row) => row.active);
    if (enabledQueries.length === 0) {
      return "Enable at least one query before starting.";
    }
    // Already ran before — allow restart without re-validating Places.
    if (campaignStatus === "paused") {
      return null;
    }
    if (preflightSummary?.status === "blocked") {
      return "Google blocked local-pack preflight — retry validation before starting.";
    }
    const hasFindable = enabledQueries.some(
      (row) =>
        isQueryFindableLive(row, preflightSummary) || row.startingPosition != null,
    );
    if (!hasFindable) {
      return "Run Validate Places ranking — need at least one query findable in the local pack.";
    }
    return null;
  }

  if (!form.keyword.trim() || !form.targetUrl.trim()) {
    return "Keyword and target URL are required.";
  }

  const enabledQueries = form.queries.filter((row) => row.active);
  if (enabledQueries.length === 0) {
    return "Enable at least one query before starting.";
  }

  if (campaignStatus === "paused") {
    return null;
  }

  if (preflightSummary?.status === "blocked") {
    return "Google blocked preflight — retry validation before starting.";
  }

  const hasSchedulableEnabled = enabledQueries.some((row) =>
    canScheduleQuery(row, preflightSummary),
  );
  if (!hasSchedulableEnabled) {
    return "Enable at least one query with GSC data or a live Google find.";
  }

  const needsLiveValidation = enabledQueries.some(
    (row) => !hasLiveCheck(row, preflightSummary),
  );
  if (needsLiveValidation) {
    return "Run Validate on Google before starting — some enabled queries have no GSC history.";
  }

  return null;
}
