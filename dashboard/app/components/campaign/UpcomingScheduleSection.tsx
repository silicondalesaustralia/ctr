"use client";

import { cellStyle, panelStyle, secondaryButtonStyle, thStyle } from "./shared";

export interface ScheduleRow {
  id: string;
  scheduledAt: string;
  status: string;
  group: string;
  attemptCount: number;
  query: string;
  identity: { externalId: string; region: string; city: string; deviceClass: string };
}

interface Props {
  upcoming: ScheduleRow[];
  scheduleNote: string | null;
  campaignStatus: string | null;
  loading: boolean;
  rebuilding: boolean;
  error: string | null;
  onRefresh: () => void;
  onRebuild: () => void;
}

export default function UpcomingScheduleSection({
  upcoming,
  scheduleNote,
  campaignStatus,
  loading,
  rebuilding,
  error,
  onRefresh,
  onRebuild,
}: Props) {
  const activeEmpty = campaignStatus === "active" && upcoming.length === 0 && !loading;

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Upcoming schedule</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
            {scheduleNote ??
              "Queued sessions for this campaign. Adaptive pacing may reshuffle times."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeEmpty && (
            <button
              type="button"
              onClick={onRebuild}
              disabled={rebuilding}
              style={secondaryButtonStyle(rebuilding)}
            >
              {rebuilding ? "Rebuilding..." : "Rebuild schedule"}
            </button>
          )}
          <button type="button" onClick={onRefresh} style={secondaryButtonStyle()}>
            Refresh
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c", margin: "0 0 12px" }}>{error}</p>}
      {loading ? (
        <p style={{ color: "#64748b" }}>Loading schedule...</p>
      ) : upcoming.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          {activeEmpty
            ? "Campaign is active but the queue is empty. Rebuild the schedule to place upcoming sessions."
            : "No upcoming sessions scheduled. Start the campaign (or wait for pacing) to build a queue."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["When", "Identity", "Geo", "Device", "Query", "Group", "Attempts"].map(
                  (header) => (
                    <th key={header} style={thStyle}>
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => (
                <tr key={row.id}>
                  <td style={cellStyle}>{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td style={cellStyle}>{row.identity.externalId}</td>
                  <td style={cellStyle}>
                    {row.identity.city
                      ? `${row.identity.city} (${row.identity.region})`
                      : row.identity.region}
                  </td>
                  <td style={cellStyle}>{row.identity.deviceClass}</td>
                  <td style={cellStyle}>{row.query}</td>
                  <td style={cellStyle}>{row.group}</td>
                  <td style={cellStyle}>{row.attemptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
