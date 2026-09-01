"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import AppLayout from "./AppLayout";
import {
  cellStyle,
  panelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  thStyle,
} from "./campaign/shared";

interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  keyword: string;
  targetUrl: string;
  campaignKind?: string;
  region: string;
  focusCity?: string | null;
  gmbBusinessName?: string | null;
  campaignDurationDays: number;
  monthlySessionTarget: number;
  queryCount: number;
  completedSessions: number;
  scheduledSessions: number;
  updatedAt: string;
  startDate: string | null;
  endDate: string | null;
}

function statusColor(status: string): string {
  if (status === "active") return "#16a34a";
  if (status === "paused") return "#d97706";
  if (status === "draft") return "#64748b";
  return "#94a3b8";
}

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<{
    id: string;
    action: "start" | "stop" | "delete";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiGet<{
        campaigns: CampaignSummary[];
        activeCount: number;
        running: boolean;
      }>("/campaigns");
      setCampaigns(result.campaigns);
      setActiveCount(result.activeCount);
      setRunning(result.running);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startCampaign(id: string) {
    setBusyAction({ id, action: "start" });
    setError(null);
    try {
      await apiPost(`/campaigns/${id}/run`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start campaign");
    } finally {
      setBusyAction(null);
    }
  }

  async function stopCampaign(id: string) {
    setBusyAction({ id, action: "stop" });
    setError(null);
    try {
      await apiPost(`/campaigns/${id}/stop`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop campaign");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteCampaignHandler(id: string, keyword: string) {
    const label = keyword.trim() || "this campaign";
    if (
      !window.confirm(
        `Delete "${label}"? This removes the campaign, scheduled sessions, and session history. This cannot be undone.`,
      )
    ) {
      return;
    }

    setBusyAction({ id, action: "delete" });
    setError(null);
    try {
      await apiDelete(`/campaigns/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete campaign");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AppLayout title="Campaigns">
      <section style={panelStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ color: "#64748b", margin: "0 0 4px", fontSize: 14 }}>
              {running
                ? `${activeCount} campaign${activeCount === 1 ? "" : "s"} running`
                : "No campaigns running"}
            </p>
            <p style={{ color: "#64748b", margin: 0, fontSize: 14 }}>
              Run multiple campaigns in parallel — they share the identity pool and worker queue.
            </p>
          </div>
          <Link href="/campaign/new" style={primaryButtonStyle("#2563eb")}>
            New campaign
          </Link>
        </div>

        {loading ? (
          <p style={{ color: "#64748b" }}>Loading campaigns...</p>
        ) : campaigns.length === 0 ? (
          <p style={{ color: "#64748b" }}>
            No campaigns yet. Create one to analyze keywords, run Google preflight, and schedule sessions.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {[
                    "Keyword",
                    "URL",
                    "Region",
                    "Status",
                    "Planned",
                    "Done",
                    "Queued",
                    "Updated",
                    "",
                  ].map((header) => (
                    <th key={header} style={thStyle}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const isBusy = busyAction?.id === campaign.id;
                  const busyLabel =
                    busyAction?.action === "start"
                      ? "Starting..."
                      : busyAction?.action === "stop"
                        ? "Stopping..."
                        : "Deleting...";

                  return (
                  <tr key={campaign.id}>
                    <td style={cellStyle}>
                      <strong>{campaign.keyword || campaign.name}</strong>
                      {campaign.campaignKind === "gmb" && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#0369a1",
                            background: "#e0f2fe",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          GMB
                        </span>
                      )}
                    </td>
                    <td style={cellStyle}>
                      <a
                        href={campaign.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#2563eb" }}
                      >
                        {campaign.campaignKind === "gmb"
                          ? (campaign.gmbBusinessName ?? "Maps listing")
                          : campaign.targetUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
                      </a>
                    </td>
                    <td style={cellStyle}>
                      {campaign.focusCity
                        ? `${campaign.focusCity} (${campaign.region})`
                        : campaign.region}
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          color: statusColor(campaign.status),
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {campaign.status}
                      </span>
                    </td>
                    <td style={cellStyle}>{campaign.monthlySessionTarget}</td>
                    <td style={cellStyle}>{campaign.completedSessions}</td>
                    <td style={cellStyle}>{campaign.scheduledSessions}</td>
                    <td style={cellStyle}>
                      {new Date(campaign.updatedAt).toLocaleDateString()}
                    </td>
                    <td style={cellStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href={`/campaign/${campaign.id}`} style={secondaryButtonStyle(isBusy)}>
                          Open
                        </Link>
                        {campaign.status === "active" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void stopCampaign(campaign.id)}
                            style={primaryButtonStyle("#dc2626", isBusy)}
                          >
                            {isBusy ? busyLabel : "Stop"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void startCampaign(campaign.id)}
                            style={primaryButtonStyle("#16a34a", isBusy)}
                          >
                            {isBusy ? busyLabel : "Start"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void deleteCampaignHandler(campaign.id, campaign.keyword || campaign.name)
                          }
                          style={{
                            ...secondaryButtonStyle(isBusy),
                            color: "#b91c1c",
                            borderColor: "#fecaca",
                          }}
                        >
                          {isBusy ? busyLabel : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && <p style={{ color: "#b91c1c", marginTop: 16 }}>{error}</p>}
      </section>
    </AppLayout>
  );
}
