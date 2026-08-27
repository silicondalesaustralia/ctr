"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import { cellStyle, panelStyle, secondaryButtonStyle, thStyle } from "./shared";

interface SessionRow {
  id: string;
  createdAt: string;
  queryText: string;
  status: string;
  observedPosition: number | null;
  serpPage: number | null;
  targetClicked: boolean | null;
  targetSkipped: boolean;
  searchAttempts: number;
  durationSeconds: number;
  personaId: string | null;
  identity: { externalId: string; region: string; deviceClass: string; personaId: string | null };
}

interface Props {
  campaignId: string;
}

export default function CampaignSessionsTab({ campaignId }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiGet<SessionRow[]>(`/sessions?experimentId=${campaignId}`);
      setSessions(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: 0 }}>Sessions</h2>
        <button type="button" onClick={() => void load()} style={secondaryButtonStyle()}>
          Refresh
        </button>
      </div>

      {error && <p style={{ color: "#b91c1c", margin: "0 0 12px" }}>{error}</p>}
      {loading ? (
        <p style={{ color: "#64748b" }}>Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: "#64748b" }}>No sessions for this campaign yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "Time",
                  "Identity",
                  "Region",
                  "Device",
                  "Query",
                  "Searches",
                  "Position",
                  "Clicked",
                  "Status",
                  "Persona",
                  "",
                ].map((header) => (
                  <th key={header} style={thStyle}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td style={cellStyle}>{new Date(session.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{session.identity.externalId}</td>
                  <td style={cellStyle}>{session.identity.region}</td>
                  <td style={cellStyle}>{session.identity.deviceClass}</td>
                  <td style={cellStyle}>{session.queryText}</td>
                  <td style={cellStyle}>{session.searchAttempts}</td>
                  <td style={cellStyle}>
                    {session.observedPosition
                      ? `#${session.observedPosition} p${session.serpPage ?? 1}`
                      : "—"}
                  </td>
                  <td style={cellStyle}>
                    {session.targetClicked
                      ? "Yes"
                      : session.targetSkipped
                        ? "Skipped"
                        : "No"}
                  </td>
                  <td style={cellStyle}>{session.status}</td>
                  <td style={cellStyle}>
                    {session.personaId ?? session.identity.personaId ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    <Link href={`/sessions/${session.id}?campaign=${campaignId}`}>Detail</Link>
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
