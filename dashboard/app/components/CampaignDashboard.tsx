"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import AppLayout from "./AppLayout";

interface RegionOption {
  code: string;
  label: string;
}

interface QueryRow {
  text: string;
  type: string;
  weight: number;
  monthlySearchVolume: number | null;
  startingPosition: number | null;
  gscImpressions28d: number | null;
  gscClicks28d: number | null;
  allocatedSessions: number | null;
}

interface QueryIntensityRow {
  query: string;
  type: string;
  weight: number;
  monthlySearchVolume: number | null;
  startingPosition: number | null;
  gscImpressions28d: number | null;
  gscClicks28d: number | null;
  allocatedSessions: number;
}

interface IntensityPreview {
  queries: QueryIntensityRow[];
  totalBaselineClicks: number;
  totalAllocatedSessions: number;
  suggestedIdentities: number;
  activeIdentityCount: number | null;
  identityDeficit: number | null;
  feasibleSessions: number | null;
  treatmentMultiplier: number;
}

interface Campaign {
  id: string;
  keyword: string;
  targetUrl: string;
  region: string;
  status: string;
  campaignDurationDays: number;
  treatmentIntensity: string;
  adaptivePacing: boolean;
  recalculateEveryDays: number;
  maxShareOfSearchDemand: number;
  desktopPercent: number;
  ctrSource: string;
  queries: QueryRow[];
  intensity: IntensitySummary | null;
}

interface IntensitySummary {
  totalBaselineClicks: number;
  totalAllocatedSessions: number;
  suggestedIdentities: number;
  activeIdentityCount: number | null;
  identityDeficit: number | null;
  feasibleSessions: number | null;
  treatmentMultiplier: number;
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
  const [keyword, setKeyword] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [region, setRegion] = useState("ALL");
  const [campaignDurationDays, setCampaignDurationDays] = useState(14);
  const [treatmentIntensity, setTreatmentIntensity] = useState("normal");
  const [adaptivePacing, setAdaptivePacing] = useState(true);
  const [recalculateEveryDays, setRecalculateEveryDays] = useState(3);
  const [maxShareOfSearchDemand, setMaxShareOfSearchDemand] = useState(0.02);
  const [desktopPercent, setDesktopPercent] = useState(65);
  const [ctrSource, setCtrSource] = useState("default_curve");
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [intensity, setIntensity] = useState<IntensitySummary | null>(null);
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
      const c = campaignRes.campaign;
      setKeyword(c.keyword);
      setTargetUrl(c.targetUrl);
      setRegion(c.region);
      setCampaignDurationDays(c.campaignDurationDays);
      setTreatmentIntensity(c.treatmentIntensity);
      setAdaptivePacing(c.adaptivePacing);
      setRecalculateEveryDays(c.recalculateEveryDays);
      setMaxShareOfSearchDemand(c.maxShareOfSearchDemand);
      setDesktopPercent(c.desktopPercent);
      setCtrSource(c.ctrSource);
      setQueries(c.queries);
      setIntensity(c.intensity);
      setCampaignStatus(c.status);
    }

    setRunning(campaignRes.running);
    setLog(logRes.entries);
  }, []);

  useEffect(() => {
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
  }, [loadCampaign]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void apiGet<{ entries: LogEntry[] }>("/campaign/log")
        .then((result) => setLog(result.entries))
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [running]);

  function buildPayload() {
    return {
      keyword,
      targetUrl,
      region,
      campaignDurationDays,
      treatmentIntensity,
      adaptivePacing,
      recalculateEveryDays,
      maxShareOfSearchDemand,
      desktopPercent,
      ctrSource,
      queries: queries.map((q) => ({
        text: q.text,
        type: q.type,
        weight: q.weight,
        monthlySearchVolume: q.monthlySearchVolume,
        startingPosition: q.startingPosition,
        gscImpressions28d: q.gscImpressions28d,
        gscClicks28d: q.gscClicks28d,
      })),
    };
  }

  async function previewIntensity() {
    setBusy("preview");
    setError(null);
    try {
      const result = await apiPost<{ intensity: IntensityPreview }>(
        "/campaign/preview-intensity",
        buildPayload(),
      );
      setIntensity({
        totalBaselineClicks: result.intensity.totalBaselineClicks,
        totalAllocatedSessions: result.intensity.totalAllocatedSessions,
        suggestedIdentities: result.intensity.suggestedIdentities,
        activeIdentityCount: result.intensity.activeIdentityCount,
        identityDeficit: result.intensity.identityDeficit,
        feasibleSessions: result.intensity.feasibleSessions,
        treatmentMultiplier: result.intensity.treatmentMultiplier,
      });
      setQueries(
        result.intensity.queries.map((q) => ({
          text: q.query,
          type: q.type,
          weight: q.weight,
          monthlySearchVolume: q.monthlySearchVolume,
          startingPosition: q.startingPosition,
          gscImpressions28d: q.gscImpressions28d,
          gscClicks28d: q.gscClicks28d,
          allocatedSessions: q.allocatedSessions,
        })),
      );
      setMessage("Intensity preview updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function createIdentities() {
    setBusy("identities");
    setError(null);
    setMessage(null);

    try {
      const result = await apiPost<{
        message: string;
        createdCount: number;
        intensity: IntensityPreview;
      }>("/campaign/create-identities", buildPayload());

      setIntensity({
        totalBaselineClicks: result.intensity.totalBaselineClicks,
        totalAllocatedSessions: result.intensity.totalAllocatedSessions,
        suggestedIdentities: result.intensity.suggestedIdentities,
        activeIdentityCount: result.intensity.activeIdentityCount,
        identityDeficit: result.intensity.identityDeficit,
        feasibleSessions: result.intensity.feasibleSessions,
        treatmentMultiplier: result.intensity.treatmentMultiplier,
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create identities");
    } finally {
      setBusy(null);
    }
  }

  async function saveCampaign() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const result = await apiPut<{ campaign: Campaign; running: boolean }>(
        "/campaign",
        buildPayload(),
      );
      setCampaignStatus(result.campaign.status);
      setRunning(result.running);
      setQueries(result.campaign.queries);
      setIntensity(result.campaign.intensity);
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
      await apiPut("/campaign", buildPayload());
      const result = await apiPost<{ campaign: Campaign; running: boolean }>("/campaign/run");
      setRunning(result.running);
      setCampaignStatus(result.campaign.status);
      setMessage("Campaign running — sessions scheduled from intensity model");
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
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setBusy(null);
    }
  }

  function updateQuery(index: number, field: keyof QueryRow, value: string) {
    setQueries((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (field === "text" || field === "type") {
          return { ...row, [field]: value };
        }
        const num = value === "" ? null : Number(value);
        return { ...row, [field]: num };
      }),
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <p>Loading...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <section style={panelStyle}>
        <h2 style={{ margin: "0 0 20px" }}>Campaign setup</h2>

        <div style={{ display: "grid", gap: 16 }}>
          <label>
            <span style={labelStyle}>Keyword</span>
            <input
              style={inputStyle}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. womens breeches"
              disabled={running}
            />
          </label>

          <label>
            <span style={labelStyle}>Target URL</span>
            <input
              style={inputStyle}
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://www.example.com.au/page"
              disabled={running}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <label>
              <span style={labelStyle}>Region</span>
              <select
                style={inputStyle}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={running}
              >
                {regions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={labelStyle}>Duration (days)</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={campaignDurationDays}
                onChange={(e) => setCampaignDurationDays(Number(e.target.value))}
                disabled={running}
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label>
              <span style={labelStyle}>Treatment intensity</span>
              <select
                style={inputStyle}
                value={treatmentIntensity}
                onChange={(e) => setTreatmentIntensity(e.target.value)}
                disabled={running}
              >
                <option value="low">Low (1.25×)</option>
                <option value="normal">Normal (1.5×)</option>
                <option value="strong">Strong (2×)</option>
              </select>
            </label>

            <label>
              <span style={labelStyle}>Desktop mix %</span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                value={desktopPercent}
                onChange={(e) => setDesktopPercent(Number(e.target.value))}
                disabled={running}
              />
            </label>

            <label>
              <span style={labelStyle}>CTR source</span>
              <select
                style={inputStyle}
                value={ctrSource}
                onChange={(e) => setCtrSource(e.target.value)}
                disabled={running}
              >
                <option value="default_curve">Default curve</option>
                <option value="gsc_site_curve">GSC site curve</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
              <input
                type="checkbox"
                checked={adaptivePacing}
                onChange={(e) => setAdaptivePacing(e.target.checked)}
                disabled={running}
              />
              <span>Rank-adaptive pacing</span>
            </label>

            <label>
              <span style={labelStyle}>Recalculate every (days)</span>
              <input
                style={inputStyle}
                type="number"
                min={1}
                value={recalculateEveryDays}
                onChange={(e) => setRecalculateEveryDays(Number(e.target.value))}
                disabled={running || !adaptivePacing}
              />
            </label>

            <label>
              <span style={labelStyle}>Max share of demand</span>
              <input
                style={inputStyle}
                type="number"
                step={0.001}
                min={0.001}
                max={0.1}
                value={maxShareOfSearchDemand}
                onChange={(e) => setMaxShareOfSearchDemand(Number(e.target.value))}
                disabled={running}
              />
            </label>
          </div>
        </div>

        {running && (
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 16 }}>
            Stop the campaign to edit settings.
          </p>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void previewIntensity()}
            disabled={Boolean(busy) || running || !keyword}
            style={secondaryButtonStyle}
          >
            {busy === "preview" ? "Calculating..." : "Preview intensity"}
          </button>
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

      {intensity && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px" }}>Recommended plan</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16 }}>
            <Stat label="Baseline clicks" value={String(intensity.totalBaselineClicks)} />
            <Stat label="Planned sessions" value={String(intensity.totalAllocatedSessions)} />
            <Stat label="Treatment ×" value={String(intensity.treatmentMultiplier)} />
            <Stat label="Active identities" value={String(intensity.activeIdentityCount ?? "—")} />
            <Stat label="Suggested identities" value={String(intensity.suggestedIdentities)} />
            {intensity.feasibleSessions != null && (
              <Stat label="Feasible w/ pool" value={String(intensity.feasibleSessions)} />
            )}
          </div>

          {intensity.identityDeficit != null && intensity.identityDeficit > 0 && (
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 8,
                background: "#fffbeb",
                border: "1px solid #fcd34d",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>Need {intensity.identityDeficit} more identities</strong>
                <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
                  You have {intensity.activeIdentityCount} active but this campaign needs{" "}
                  {intensity.suggestedIdentities}. Only {intensity.feasibleSessions} of{" "}
                  {intensity.totalAllocatedSessions} sessions can run with the current pool.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createIdentities()}
                disabled={Boolean(busy) || running}
                style={primaryButtonStyle("#2563eb")}
              >
                {busy === "identities"
                  ? "Creating..."
                  : `Create ${intensity.identityDeficit} identities`}
              </button>
            </div>
          )}

          {intensity.identityDeficit === 0 && intensity.activeIdentityCount != null && (
            <p style={{ marginTop: 16, color: "#16a34a", fontSize: 14 }}>
              Identity pool is sufficient for this campaign plan.
            </p>
          )}
        </section>
      )}

      {queries.length > 0 && (
        <section style={{ ...panelStyle, marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 16px" }}>Query cluster</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {[
                    "Query",
                    "Type",
                    "Volume/mo",
                    "Position",
                    "GSC impr.",
                    "GSC clicks",
                    "Sessions",
                  ].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queries.map((row, index) => (
                  <tr key={row.text}>
                    <td style={cellStyle}>{row.text}</td>
                    <td style={cellStyle}>{row.type}</td>
                    <td style={cellStyle}>
                      <input
                        style={{ ...inputStyle, padding: "6px 8px", width: 90 }}
                        type="number"
                        value={row.monthlySearchVolume ?? ""}
                        onChange={(e) => updateQuery(index, "monthlySearchVolume", e.target.value)}
                        disabled={running}
                        placeholder="—"
                      />
                    </td>
                    <td style={cellStyle}>
                      <input
                        style={{ ...inputStyle, padding: "6px 8px", width: 70 }}
                        type="number"
                        step={0.1}
                        value={row.startingPosition ?? ""}
                        onChange={(e) => updateQuery(index, "startingPosition", e.target.value)}
                        disabled={running}
                        placeholder="—"
                      />
                    </td>
                    <td style={cellStyle}>{row.gscImpressions28d ?? "—"}</td>
                    <td style={cellStyle}>{row.gscClicks28d ?? "—"}</td>
                    <td style={cellStyle}>{row.allocatedSessions ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Campaign log</h2>
          <button type="button" onClick={() => void loadCampaign()} style={secondaryButtonStyle}>
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
                  {["Time", "Query", "Position", "Clicked", "Status", "Region", "Device", "Duration", ""].map(
                    (header) => (
                      <th key={header} style={thStyle}>
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id}>
                    <td style={cellStyle}>{new Date(entry.time).toLocaleString()}</td>
                    <td style={cellStyle}>{entry.query}</td>
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
                    <td style={cellStyle}>
                      <Link href={`/sessions/${entry.id}`}>View</Link>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontWeight: 600,
};

const cellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
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
