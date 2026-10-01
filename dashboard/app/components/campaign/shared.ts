import type React from "react";

export type CampaignTab = "plan" | "sessions" | "snapshots" | "identities";

export interface RegionOption {
  code: string;
  label: string;
  city?: string;
}

export type CampaignKind = "url" | "gmb";

/** Hyper-local city pool vs any identity in the campaign country. */
export type IdentityGeoScope = "city" | "country";
export type IdentityPool = "warmed" | "any";

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
  preflightSource?: string;
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
    source?: string;
  }>;
}

const placesSourceLabels: Record<string, string> = {
  local_pack: "3-pack",
  more_places: "Places list",
  maps_keyword: "Maps",
};

export function placesSourceLabel(source: string | undefined): string {
  return source ? (placesSourceLabels[source] ?? source) : "";
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
  identityGeoScope: IdentityGeoScope;
  identityPool: IdentityPool;
  geoLatitude: number | null;
  geoLongitude: number | null;
  geoRadiusKm: number | null;
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
  padding: "11px 13px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 14,
  boxSizing: "border-box",
};

export const panelStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  padding: 24,
  boxShadow: "0 3px 8px #24294c03",
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontWeight: 600,
  fontSize: 13,
};

export const cellStyle: React.CSSProperties = {
  padding: "14px 14px",
  borderBottom: "1px solid var(--line-soft)",
  verticalAlign: "top",
  fontSize: 13,
};

export const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBlock: "1px solid var(--line)",
  whiteSpace: "nowrap",
};

export const secondaryButtonBase: React.CSSProperties = {
  padding: "9px 15px",
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--text)",
  fontWeight: 600,
  fontSize: 13,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
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
    padding: "10px 18px",
    borderRadius: "var(--radius-control)",
    border: `1px solid ${color}`,
    background: color,
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: 13,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    boxShadow: "0 3px 7px #6155dc18",
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
