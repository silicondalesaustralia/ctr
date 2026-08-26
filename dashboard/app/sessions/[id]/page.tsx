"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiGet } from "../../../lib/api";
import AppLayout from "../../components/AppLayout";
import AuthGate from "../../components/AuthGate";

interface SessionDetail {
  id: string;
  status: string;
  queryText: string;
  personaId: string | null;
  searchAttempts: number;
  observedPosition: number | null;
  serpPage: number | null;
  targetClicked: boolean | null;
  targetSkipped: boolean;
  landingUrl: string | null;
  finalUrl: string | null;
  durationSeconds: number;
  pageviews: number;
  internalClicks: number;
  scrollDepth: number;
  queriesUsedJson: string | null;
  sessionTraitsJson: string | null;
  identity: { externalId: string; region: string; deviceClass: string; personaId: string | null };
  experiment: { name: string; targetUrl: string };
  events: Array<{ timestamp: string; eventType: string; metadataJson: string | null }>;
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<SessionDetail>(`/sessions/${sessionId}`)
      .then(setSession)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load session");
      });
  }, [sessionId]);

  let queriesUsed: string[] = [];
  if (session?.queriesUsedJson) {
    try {
      queriesUsed = JSON.parse(session.queriesUsedJson) as string[];
    } catch {
      queriesUsed = [];
    }
  }

  return (
    <AuthGate>
      <AppLayout title="Session detail">
        <p style={{ marginTop: 0 }}>
          <Link href="/sessions">← Back to sessions</Link>
        </p>

        {error && (
          <div style={panelStyle}>
            <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
          </div>
        )}

        {!session && !error && (
          <div style={panelStyle}>
            <p style={{ margin: 0 }}>Loading...</p>
          </div>
        )}

        {session && (
          <>
            <div style={panelStyle}>
              <p><strong>Status:</strong> {session.status}</p>
              <p><strong>Experiment:</strong> {session.experiment.name}</p>
              <p><strong>Query:</strong> {session.queryText}</p>
              {queriesUsed.length > 1 && (
                <p><strong>Query path:</strong> {queriesUsed.join(" → ")}</p>
              )}
              <p><strong>Identity:</strong> {session.identity.externalId} ({session.identity.region}, {session.identity.deviceClass})</p>
              <p><strong>Persona:</strong> {session.personaId ?? session.identity.personaId ?? "—"}</p>
              <p><strong>SERP:</strong> {session.observedPosition ? `#${session.observedPosition} page ${session.serpPage}` : "Not found"}</p>
              <p><strong>Clicked:</strong> {session.targetClicked ? "Yes" : session.targetSkipped ? "Skipped" : "No"}</p>
              <p><strong>Landing:</strong> {session.landingUrl ?? "—"}</p>
              <p><strong>Final URL:</strong> {session.finalUrl ?? "—"}</p>
              <p><strong>Duration:</strong> {session.durationSeconds}s · {session.pageviews} pages · {session.internalClicks} internal clicks · {session.scrollDepth.toFixed(0)}% scroll</p>
            </div>

            <div style={panelStyle}>
              <h3 style={{ marginTop: 0 }}>Event timeline</h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {session.events.map((event) => (
                  <li key={`${event.timestamp}-${event.eventType}`} style={{ marginBottom: 8 }}>
                    {new Date(event.timestamp).toLocaleString()} — {event.eventType}
                    {event.metadataJson ? (
                      <pre style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
                        {event.metadataJson}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </AppLayout>
    </AuthGate>
  );
}

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 24,
  marginBottom: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};
