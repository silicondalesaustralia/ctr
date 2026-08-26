"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearStoredApiKey, isAuthenticated } from "../../lib/auth";
import { apiGet, apiPost, apiPut } from "../../lib/api";

interface RegionOption {
  code: string;
  label: string;
}

interface Campaign {
  id: string;
  keyword: string;
  targetUrl: string;
  region: string;
  status: string;
  queries: Array<{ text: string; type: string; weight: number }>;
}

interface LogEntry {
  id: string;
  time: string;
  query: string;
  queriesUsed: string[];
  searchAttempts: number;
  status: string;
  serpPosition: number | null;
  serpPage: number | null;
  clicked: boolean;
  skipped: boolean;
  landingUrl: string | null;
  region: string;
  identity: string;
  device: string;
  persona: string | null;
  durationSeconds: number;
  pageviews: number;
  scrollDepth: number;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 15,
  boxSizing: "border-box",
};

export default function CampaignDashboard() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [region, setRegion] = useState("ALL");
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [running, setRunning] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState<string>("draft");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    const [campaignRes, logRes] = await Promise.all([
      apiGet<{ campaign: Campaign | null; running: boolean }>("/campaign"),
      apiGet<{ entries: LogEntry[] }>("/campaign/log"),
    ]);

    if (campaignRes.campaign) {
      setKeyword(campaignRes.campaign.keyword);
      setTargetUrl(campaignRes.campaign.targetUrl);
      setRegion(campaignRes.campaign.region);
      setCampaignStatus(campaignRes.campaign.status);
    }

    setRunning(campaignRes.running);
    setLog(logRes.entries);
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    void (async () => {
      try {
        const regionOptions = await apiGet<RegionOption[]>("/regions");
        setRegions(regionOptions);
        await loadCampaign();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, loadCampaign]);

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = setInterval(() => {
      void apiGet<{ entries: LogEntry[] }>("/campaign/log")
        .then((result) => setLog(result.entries))
        .catch(() => undefined);
    }, 10000);

    return () => clearInterval(timer);
  }, [running]);

  async function saveCampaign() {
    setBusy("save");
    setError(null);
    setMessage(null);

    try {
      const result = await apiPut<{ campaign: Campaign; running: boolean }>("/campaign", {
        keyword,
        targetUrl,
        region,
      });
      setCampaignStatus(result.campaign.status);
      setRunning(result.running);
      setMessage("Campaign saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  async function runCampaign() {
    setBusy("run");
    setError(null);
    setMessage(null);

    try {
      await apiPut("/campaign", { keyword, targetUrl, region });
      const result = await apiPost<{ campaign: Campaign; running: boolean }>("/campaign/run");
      setRunning(result.running);
      setCampaignStatus(result.campaign.status);
      setMessage("Campaign running — sessions will execute on schedule");
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start campaign");
    } finally {
      setBusy(null);
    }
  }

  async function stopCampaign() {
    setBusy("stop");
    setError(null);
    setMessage(null);

    try {
      const result = await apiPost<{ campaign: Campaign; running: boolean }>("/campaign/stop");
      setRunning(result.running);
      setCampaignStatus(result.campaign.status);
      setMessage("Campaign stopped");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop campaign");
    } finally {
      setBusy(null);
    }
  }

  function logout() {
    clearStoredApiKey();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      <header
        style={{
          background: "#0f172a",
          color: "white",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong style={{ fontSize: 18 }}>CTR Campaign</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 13,
              background: running ? "#16a34a" : "#64748b",
            }}
          >
            {running ? "Running" : "Stopped"}
          </span>
          <button
            type="button"
            onClick={logout}
            style={{
              background: "transparent",
              border: "1px solid #475569",
              color: "#e2e8f0",
              borderRadius: 6,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <section
          style={{
            background: "white",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ margin: "0 0 20px" }}>Campaign setup</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <label>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Keyword</span>
              <input
                style={inputStyle}
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="e.g. womens breeches"
                disabled={running}
              />
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Target URL</span>
              <input
                style={inputStyle}
                type="url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://www.example.com.au/page"
                disabled={running}
              />
            </label>

            <label>
              <span style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Region</span>
              <select
                style={inputStyle}
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                disabled={running}
              >
                {regions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {running && (
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 16 }}>
              Stop the campaign to edit settings.
            </p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void saveCampaign()}
              disabled={Boolean(busy) || running}
              style={secondaryButtonStyle}
            >
              {busy === "save" ? "Saving..." : "Save"}
            </button>

            {!running ? (
              <button
                type="button"
                onClick={() => void runCampaign()}
                disabled={Boolean(busy) || !keyword || !targetUrl}
                style={primaryButtonStyle("#16a34a")}
              >
                {busy === "run" ? "Starting..." : "Run campaign"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stopCampaign()}
                disabled={Boolean(busy)}
                style={primaryButtonStyle("#dc2626")}
              >
                {busy === "stop" ? "Stopping..." : "Stop campaign"}
              </button>
            )}
          </div>

          {message && <p style={{ color: "#16a34a", marginTop: 16 }}>{message}</p>}
          {error && <p style={{ color: "#b91c1c", marginTop: 16 }}>{error}</p>}
        </section>

        <section
          style={{
            background: "white",
            borderRadius: 12,
            padding: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>Campaign log</h2>
            <button
              type="button"
              onClick={() => void loadCampaign()}
              style={secondaryButtonStyle}
            >
              Refresh
            </button>
          </div>

          {log.length === 0 ? (
            <p style={{ color: "#64748b" }}>No sessions yet. Run the campaign to start searching.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Time",
                      "Query",
                      "Searches",
                      "Position",
                      "Clicked",
                      "Status",
                      "Region",
                      "Device",
                      "Duration",
                      "Pages",
                    ].map((header) => (
                      <th
                        key={header}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderBottom: "1px solid #e2e8f0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {log.map((entry) => (
                    <tr key={entry.id}>
                      <td style={cellStyle}>{new Date(entry.time).toLocaleString()}</td>
                      <td style={cellStyle}>
                        <div>{entry.query}</div>
                        {entry.queriesUsed.length > 1 && (
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            → {entry.queriesUsed.join(" → ")}
                          </div>
                        )}
                      </td>
                      <td style={cellStyle}>{entry.searchAttempts}</td>
                      <td style={cellStyle}>
                        {entry.serpPosition ? `#${entry.serpPosition} p${entry.serpPage ?? 1}` : "—"}
                      </td>
                      <td style={cellStyle}>
                        {entry.clicked ? "Yes" : entry.skipped ? "Skipped" : "No"}
                      </td>
                      <td style={cellStyle}>{entry.status}</td>
                      <td style={cellStyle}>{entry.region}</td>
                      <td style={cellStyle}>{entry.device}</td>
                      <td style={cellStyle}>
                        {entry.durationSeconds > 0 ? `${entry.durationSeconds}s` : "—"}
                      </td>
                      <td style={cellStyle}>{entry.pageviews || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "white",
  cursor: "pointer",
  fontWeight: 600,
};

function primaryButtonStyle(color: string): React.CSSProperties {
  return {
    padding: "10px 22px",
    borderRadius: 8,
    border: "none",
    background: color,
    color: "white",
    cursor: "pointer",
    fontWeight: 600,
  };
}
