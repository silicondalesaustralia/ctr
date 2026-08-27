"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPut } from "../../../lib/api";
import { cellStyle, panelStyle, primaryButtonStyle, secondaryButtonStyle, thStyle } from "./shared";

export interface WarmupProgress {
  status: string;
  sessionsCompleted: number;
  siteClicks: number;
  ageDays: number;
  minDays: number;
  minSessions: number;
  minSiteClicks: number;
  eligible: boolean;
  eligibleAt: string | null;
  scheduledRemaining: number;
}

export interface IdentityPickerRow {
  id: string;
  externalId: string;
  region: string;
  city: string;
  deviceClass: string;
  personaId: string | null;
  active: boolean;
  inRegionPool?: boolean;
  selected: boolean;
  warmup: WarmupProgress;
  createdAt?: string;
  totalSessions?: number;
  googleSessions?: number;
  blockedSessions?: number;
  campaignSessions?: number;
  campaignClicks?: number;
  campaignBlocked?: number;
  lastUsedForCampaign?: string | null;
}

interface Props {
  campaignId?: string;
  regionLabel: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  readonly?: boolean;
}

function warmupLabel(warmup: WarmupProgress): string {
  if (warmup.eligible) return "Eligible";
  return `Warming (${warmup.sessionsCompleted}/${warmup.minSessions} sessions, ${warmup.siteClicks}/${warmup.minSiteClicks} clicks, ${warmup.ageDays}/${warmup.minDays}d)`;
}

function warmupColor(warmup: WarmupProgress): string {
  return warmup.eligible ? "#15803d" : "#b45309";
}

export default function CampaignIdentityPicker({
  campaignId,
  regionLabel,
  selectedIds,
  onSelectionChange,
  readonly = false,
}: Props) {
  const [identities, setIdentities] = useState<IdentityPickerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const initializedSelection = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (campaignId) {
        const result = await apiGet<{ identities: IdentityPickerRow[] }>(
          `/campaigns/${campaignId}/identities`,
        );
        setIdentities(result.identities);
        if (!initializedSelection.current) {
          initializedSelection.current = true;
          onSelectionChange(
            result.identities.filter((row) => row.selected).map((row) => row.id),
          );
        }
      } else {
        const result = await apiGet<{ identities: IdentityPickerRow[] }>("/identities");
        const rows = result.identities.map((row) => ({
          ...row,
          inRegionPool:
            regionLabel === "ALL" || !regionLabel || row.region === regionLabel,
          selected:
            regionLabel === "ALL" || !regionLabel || row.region === regionLabel
              ? row.warmup.eligible
              : false,
        }));
        setIdentities(rows);
        if (!initializedSelection.current) {
          initializedSelection.current = true;
          onSelectionChange(
            rows
              .filter((row) => row.warmup.eligible && row.inRegionPool !== false)
              .map((row) => row.id),
          );
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load identities");
    } finally {
      setLoading(false);
    }
  }, [campaignId, onSelectionChange, regionLabel]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    if (readonly) return;
    const next = selectedIds.includes(id)
      ? selectedIds.filter((value) => value !== id)
      : [...selectedIds, id];
    onSelectionChange(next);
  }

  function selectEligibleInRegion() {
    if (readonly) return;
    onSelectionChange(
      identities
        .filter((row) => row.warmup.eligible && row.inRegionPool !== false)
        .map((row) => row.id),
    );
  }

  function clearSelection() {
    if (readonly) return;
    onSelectionChange([]);
  }

  async function saveSelection() {
    if (!campaignId || readonly) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await apiPut<{ identities: IdentityPickerRow[] }>(
        `/campaigns/${campaignId}/identities`,
        { identityIds: selectedIds },
      );
      setIdentities(result.identities);
      setMessage("Identity selection saved");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save selection");
    } finally {
      setSaving(false);
    }
  }

  const selectedEligible = identities.filter(
    (row) => selectedIds.includes(row.id) && row.warmup.eligible,
  ).length;

  return (
    <section style={panelStyle}>
      <h2 style={{ margin: "0 0 8px" }}>Campaign identities</h2>
      <p style={{ color: "#64748b", margin: "0 0 16px", fontSize: 14 }}>
        Select warmed-up browser profiles for this campaign. Identities start warming automatically
        when created — eligible after {identities[0]?.warmup.minDays ?? 2} days,{" "}
        {identities[0]?.warmup.minSessions ?? 10} Google sessions, and{" "}
        {identities[0]?.warmup.minSiteClicks ?? 2} site clicks.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {!readonly && (
          <>
            <button type="button" style={secondaryButtonStyle(false)} onClick={selectEligibleInRegion}>
              Select eligible in {regionLabel}
            </button>
            <button type="button" style={secondaryButtonStyle(false)} onClick={clearSelection}>
              Clear selection
            </button>
            {campaignId && (
              <button
                type="button"
                style={primaryButtonStyle("#2563eb", saving)}
                disabled={saving}
                onClick={() => void saveSelection()}
              >
                {saving ? "Saving..." : "Save selection"}
              </button>
            )}
          </>
        )}
        <span style={{ color: "#64748b", fontSize: 14, alignSelf: "center" }}>
          {selectedIds.length} selected ({selectedEligible} eligible)
        </span>
      </div>

      {message && <p style={{ color: "#15803d", margin: "0 0 12px" }}>{message}</p>}
      {error && <p style={{ color: "#b91c1c", margin: "0 0 12px" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading identities...</p>
      ) : identities.length === 0 ? (
        <p style={{ color: "#64748b" }}>No identities yet. Create identities to start warmup.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {!readonly && <th style={thStyle}>Use</th>}
                {["ID", "Region", "Device", "Warmup", "Total sessions", "Blocked", "Created"].map(
                  (header) => (
                    <th key={header} style={thStyle}>
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {identities.map((identity) => (
                <tr key={identity.id} style={{ opacity: identity.active ? 1 : 0.6 }}>
                  {!readonly && (
                    <td style={cellStyle}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(identity.id)}
                        disabled={!identity.active}
                        onChange={() => toggle(identity.id)}
                      />
                    </td>
                  )}
                  <td style={cellStyle}>{identity.externalId}</td>
                  <td style={cellStyle}>
                    {identity.region} / {identity.city}
                  </td>
                  <td style={cellStyle}>{identity.deviceClass}</td>
                  <td style={{ ...cellStyle, color: warmupColor(identity.warmup), fontWeight: 600 }}>
                    {warmupLabel(identity.warmup)}
                    {identity.warmup.scheduledRemaining > 0
                      ? ` · ${identity.warmup.scheduledRemaining} queued`
                      : ""}
                  </td>
                  <td style={cellStyle}>{identity.totalSessions ?? identity.campaignSessions ?? 0}</td>
                  <td style={cellStyle}>{identity.blockedSessions ?? identity.campaignBlocked ?? 0}</td>
                  <td style={cellStyle}>
                    {identity.createdAt
                      ? new Date(identity.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
