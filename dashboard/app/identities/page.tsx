"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGate from "../components/AuthGate";
import AppLayout from "../components/AppLayout";
import WarmPoolPanel from "../components/WarmPoolPanel";
import CreateIdentitiesForm from "../components/CreateIdentitiesForm";
import { apiGet, apiPost } from "../../lib/api";
import { describeLocation, useCountries, type CreateIdentitiesRequest } from "../../lib/geo";
import { cellStyle, panelStyle, secondaryButtonStyle, thStyle } from "../components/campaign/shared";
import type { WarmupProgress } from "../components/campaign/CampaignIdentityPicker";

interface IdentityRow {
  id: string;
  externalId: string;
  country?: string;
  region: string;
  city: string;
  deviceClass: string;
  personaId: string | null;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  totalSessions: number;
  googleSessions: number;
  blockedSessions: number;
  targetClicks: number;
  warmup: WarmupProgress;
}

function warmupLabel(warmup: WarmupProgress): string {
  if (warmup.eligible) return "Eligible";
  const graduation = warmup.graduationPassed ? "graduation done" : "graduation pending";
  return `${warmup.siteClicks}/${warmup.minSiteClicks} opens · ${graduation} · ${warmup.ageDays}/${warmup.minDays}d`;
}

function normalizeIdentitiesResponse(payload: unknown): IdentityRow[] {
  if (Array.isArray(payload)) {
    return payload as IdentityRow[];
  }
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { identities?: IdentityRow[] }).identities)
  ) {
    return (payload as { identities: IdentityRow[] }).identities;
  }
  return [];
}

export default function IdentitiesPageWrapper() {
  return (
    <AuthGate>
      <IdentitiesPage />
    </AuthGate>
  );
}

function IdentitiesPage() {
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { countries } = useCountries();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGet<{ identities?: IdentityRow[] } | IdentityRow[]>("/identities");
      setIdentities(normalizeIdentitiesResponse(result));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load identities");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createIdentities(request: CreateIdentitiesRequest) {
    setBusy("create");
    setMessage(null);
    setError(null);
    try {
      await apiPost("/identities/create", request);
      const count = request.count;
      setMessage(
        `Created ${count} ${describeLocation(request, countries)} identit${count === 1 ? "y" : "ies"} — warmup sessions scheduled automatically`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create identities");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(id: string, enable: boolean) {
    setBusy(id);
    try {
      await apiPost(`/identities/${id}/${enable ? "enable" : "disable"}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update identity");
    } finally {
      setBusy(null);
    }
  }

  const warming = identities.filter((row) => !row.warmup.eligible).length;
  const eligible = identities.filter((row) => row.warmup.eligible).length;

  return (
    <AppLayout title="Identities">
      <WarmPoolPanel />
      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: "0 0 8px" }}>Identities</h1>
            <p style={{ color: "#767d8e", margin: 0, fontSize: 15 }}>
              Browser profiles warm up automatically after creation. Each campaign chooses warmed-only
              or any identity (including unwarmed) in its review step.
            </p>
          </div>
          <CreateIdentitiesForm
            busy={busy === "create"}
            countries={countries}
            onCreate={(request) => void createIdentities(request)}
          />
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ background: "#fafbfc", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 12, color: "#767d8e" }}>Total</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{identities.length}</div>
          </div>
          <div style={{ background: "#fef3c7", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 12, color: "#92400e" }}>Warming</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{warming}</div>
          </div>
          <div style={{ background: "#eaf7f1", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ fontSize: 12, color: "#14634e" }}>Eligible</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{eligible}</div>
          </div>
        </div>

        {message && <p style={{ color: "#198366", margin: "0 0 12px" }}>{message}</p>}
        {error && <p style={{ color: "#bf4352", margin: "0 0 12px" }}>{error}</p>}

        {loading ? (
          <p style={{ color: "#767d8e" }}>Loading...</p>
        ) : error ? (
          <p style={{ color: "#767d8e" }}>
            Could not load identities. Check that you are logged in and the API is deployed with the
            latest schema (<code>npm run db:push</code>).
          </p>
        ) : identities.length === 0 ? (
          <p style={{ color: "#767d8e" }}>No identities yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#fafbfc" }}>
                  {[
                    "ID",
                    "Location",
                    "Device",
                    "Warmup",
                    "Google sessions",
                    "Site clicks",
                    "Blocked",
                    "Last used",
                    "Active",
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
                    <td style={cellStyle}>{identity.externalId}</td>
                    <td style={cellStyle}>
                      {identity.country ?? "AU"} · {identity.region} / {identity.city}
                    </td>
                    <td style={cellStyle}>{identity.deviceClass}</td>
                    <td
                      style={{
                        ...cellStyle,
                        color: identity.warmup.eligible ? "#198366" : "#b45309",
                        fontWeight: 600,
                      }}
                    >
                      {warmupLabel(identity.warmup)}
                      {identity.warmup.scheduledRemaining > 0
                        ? ` (${identity.warmup.scheduledRemaining} queued)`
                        : ""}
                    </td>
                    <td style={cellStyle}>{identity.googleSessions}</td>
                    <td style={cellStyle}>{identity.warmup.siteClicks}</td>
                    <td style={cellStyle}>{identity.blockedSessions}</td>
                    <td style={cellStyle}>
                      {identity.lastUsedAt
                        ? new Date(identity.lastUsedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td style={cellStyle}>{identity.active ? "Yes" : "No"}</td>
                    <td style={cellStyle}>
                      <button
                        type="button"
                        disabled={busy === identity.id}
                        onClick={() => void toggleActive(identity.id, !identity.active)}
                        style={{
                          ...secondaryButtonStyle(busy === identity.id),
                          padding: "4px 10px",
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
    </AppLayout>
  );
}
