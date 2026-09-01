"use client";

import Link from "next/link";
import { cellStyle, panelStyle, thStyle } from "./shared";
import type { CampaignKind } from "./shared";
import { formatInTimezone } from "../../../lib/format-timezone";

export interface SessionRow {
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
  campaignKind: CampaignKind;
  scheduleTimezone: string;
  sessions: SessionRow[];
  loading: boolean;
}

export default function CompletedSessionsSection({
  campaignId,
  campaignKind,
  scheduleTimezone,
  sessions,
  loading,
}: Props) {
  const isGmb = campaignKind === "gmb";

  return (
    <section style={panelStyle}>
      <h2 style={{ margin: "0 0 16px" }}>Completed sessions</h2>
      {loading ? (
        <p style={{ color: "#64748b" }}>Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: "#64748b" }}>No completed sessions for this campaign yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {[
                  "Time",
                  "Identity",
                  "Geo",
                  "Device",
                  "Query",
                  "Searches",
                  isGmb ? "Places rank" : "Position",
                  isGmb ? "Listing opened" : "Clicked",
                  "Status",
                  "Persona",
                  "",
                ].map((header) => (
                  <th key={header || "detail"} style={thStyle}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td style={cellStyle}>
                    {formatInTimezone(session.createdAt, scheduleTimezone)}
                  </td>
                  <td style={cellStyle}>{session.identity.externalId}</td>
                  <td style={cellStyle}>{session.identity.region}</td>
                  <td style={cellStyle}>{session.identity.deviceClass}</td>
                  <td style={cellStyle}>{session.queryText}</td>
                  <td style={cellStyle}>{session.searchAttempts}</td>
                  <td style={cellStyle}>
                    {session.observedPosition
                      ? isGmb
                        ? `#${session.observedPosition}`
                        : `#${session.observedPosition} p${session.serpPage ?? 1}`
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
