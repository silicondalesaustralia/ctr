"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import AppLayout from "../components/AppLayout";
import AuthGate from "../components/AuthGate";

interface IdentityRow {
  id: string;
  externalId: string;
  region: string;
  city: string;
  deviceClass: string;
  personaId: string | null;
  active: boolean;
  totalSessions: number;
  googleSessions: number;
  targetClicks: number;
  blockedSessions: number;
  lastUsedAt: string | null;
}

export default function IdentitiesPage() {
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const rows = await apiGet<IdentityRow[]>("/identities");
    setIdentities(rows);
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load identities");
    });
  }, []);

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
    <AuthGate>
      <AppLayout title="Identities">
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Browser profiles used for search sessions. Each identity has a persistent behavioural persona.
        </p>

        {error && (
          <div style={panelStyle}>
            <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
          </div>
        )}

        <div style={panelStyle}>
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
                    "Google",
                    "Clicks",
                    "Blocked",
                    "Last used",
                    "",
                  ].map((header) => (
                    <th key={header} style={thStyle}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {identities.map((identity) => (
                  <tr key={identity.id}>
                    <td style={tdStyle}>{identity.externalId}</td>
                    <td style={tdStyle}>{identity.region}</td>
                    <td style={tdStyle}>{identity.city}</td>
                    <td style={tdStyle}>{identity.deviceClass}</td>
                    <td style={tdStyle}>{identity.personaId ?? "—"}</td>
                    <td style={tdStyle}>{identity.active ? "Yes" : "No"}</td>
                    <td style={tdStyle}>{identity.totalSessions}</td>
                    <td style={tdStyle}>{identity.googleSessions}</td>
                    <td style={tdStyle}>{identity.targetClicks}</td>
                    <td style={tdStyle}>{identity.blockedSessions}</td>
                    <td style={tdStyle}>
                      {identity.lastUsedAt
                        ? new Date(identity.lastUsedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td style={tdStyle}>
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
        </div>
      </AppLayout>
    </AuthGate>
  );
}

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};
