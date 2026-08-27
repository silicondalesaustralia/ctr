"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../../lib/api";
import { cellStyle, panelStyle, thStyle } from "./shared";

interface IdentityRow {
  id: string;
  externalId: string;
  region: string;
  city: string;
  deviceClass: string;
  personaId: string | null;
  active: boolean;
  campaignSessions: number;
  campaignClicks: number;
  campaignBlocked: number;
  lastUsedForCampaign: string | null;
  inRegionPool: boolean;
}

interface Props {
  campaignId: string;
  regionLabel: string;
}

export default function CampaignIdentitiesTab({ campaignId, regionLabel }: Props) {
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<{ identities: IdentityRow[] }>(
        `/campaigns/${campaignId}/identities`,
      );
      setIdentities(result.identities);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load identities");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(id: string, enable: boolean) {
    setBusyId(id);
    try {
      await apiPost(`/identities/${id}/${enable ? "enable" : "disable"}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update identity");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section style={panelStyle}>
      <h2 style={{ margin: "0 0 8px" }}>Identities</h2>
      <p style={{ color: "#64748b", margin: "0 0 16px", fontSize: 14 }}>
        Browser profiles for this campaign — pool matches region {regionLabel}. Stats are for
        this campaign only.
      </p>

      {error && <p style={{ color: "#b91c1c", margin: "0 0 12px" }}>{error}</p>}
      {loading ? (
        <p style={{ color: "#64748b" }}>Loading identities...</p>
      ) : identities.length === 0 ? (
        <p style={{ color: "#64748b" }}>No identities in the pool for this region.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "ID",
                  "Region",
                  "City",
                  "Device",
                  "Persona",
                  "Active",
                  "Sessions",
                  "Clicks",
                  "Blocked",
                  "Last used",
                  "",
                ].map((header) => (
                  <th key={header} style={thStyle}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {identities.map((identity) => (
                <tr key={identity.id}>
                  <td style={cellStyle}>{identity.externalId}</td>
                  <td style={cellStyle}>{identity.region}</td>
                  <td style={cellStyle}>{identity.city}</td>
                  <td style={cellStyle}>{identity.deviceClass}</td>
                  <td style={cellStyle}>{identity.personaId ?? "—"}</td>
                  <td style={cellStyle}>{identity.active ? "Yes" : "No"}</td>
                  <td style={cellStyle}>{identity.campaignSessions}</td>
                  <td style={cellStyle}>{identity.campaignClicks}</td>
                  <td style={cellStyle}>{identity.campaignBlocked}</td>
                  <td style={cellStyle}>
                    {identity.lastUsedForCampaign
                      ? new Date(identity.lastUsedForCampaign).toLocaleString()
                      : "—"}
                  </td>
                  <td style={cellStyle}>
                    <button
                      type="button"
                      disabled={busyId === identity.id}
                      onClick={() => void toggle(identity.id, !identity.active)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid #cbd5e1",
                        background: "white",
                        cursor: busyId === identity.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {identity.active ? "Disable" : "Enable"}
                    </button>
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
