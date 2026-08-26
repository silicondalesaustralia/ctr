"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import AppLayout from "../components/AppLayout";
import AuthGate from "../components/AuthGate";

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
  scrollDepth: number;
  internalClicks: number;
  personaId: string | null;
  identity: { externalId: string; region: string; deviceClass: string; personaId: string | null };
  experiment: { name: string };
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<SessionRow[]>("/sessions")
      .then(setSessions)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      });
  }, []);

  return (
    <AuthGate>
      <AppLayout title="Sessions">
        {error && (
          <div style={panelStyle}>
            <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
          </div>
        )}

        <div style={panelStyle}>
          {sessions.length === 0 ? (
            <p style={{ color: "#64748b", margin: 0 }}>No sessions yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Time",
                      "Experiment",
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
                      <th key={header} style={thStyle}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id}>
                      <td style={tdStyle}>{new Date(session.createdAt).toLocaleString()}</td>
                      <td style={tdStyle}>{session.experiment.name}</td>
                      <td style={tdStyle}>{session.identity.externalId}</td>
                      <td style={tdStyle}>{session.identity.region}</td>
                      <td style={tdStyle}>{session.identity.deviceClass}</td>
                      <td style={tdStyle}>{session.queryText}</td>
                      <td style={tdStyle}>{session.searchAttempts}</td>
                      <td style={tdStyle}>
                        {session.observedPosition
                          ? `#${session.observedPosition} p${session.serpPage ?? 1}`
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        {session.targetClicked
                          ? "Yes"
                          : session.targetSkipped
                            ? "Skipped"
                            : "No"}
                      </td>
                      <td style={tdStyle}>{session.status}</td>
                      <td style={tdStyle}>
                        {session.personaId ?? session.identity.personaId ?? "—"}
                      </td>
                      <td style={tdStyle}>
                        <Link href={`/sessions/${session.id}`}>Detail</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
