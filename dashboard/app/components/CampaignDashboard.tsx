"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import AppLayout from "./AppLayout";
import CampaignReviewStep from "./campaign/CampaignReviewStep";
import CampaignSetupStep from "./campaign/CampaignSetupStep";
import type { GscConnectionOption, GscSiteOption } from "./campaign/CampaignSetupStep";
import type {
  CampaignFormState,
  IntensitySummary,
  QueryRow,
  RegionOption,
  SettingRationale,
} from "./campaign/shared";
import { cellStyle, panelStyle, secondaryButtonStyle, thStyle } from "./campaign/shared";

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

interface CampaignProposal extends CampaignFormState {
  intensity: IntensityPreview;
  rationales: SettingRationale[];
  gscStatus: "live" | "unavailable";
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
  maxShareOfGscImpressions: number;
  desktopPercent: number;
  ctrSource: string;
  gscConnectionId: string | null;
  gscSiteUrl: string | null;
  queries: QueryRow[];
  intensity: IntensitySummary | null;
}

interface LogEntry {
  id: string;
  time: string;
  query: string;
  status: string;
  serpPosition: number | null;
  serpPage: number | null;
  clicked: boolean;
  skipped: boolean;
  region: string;
  device: string;
  durationSeconds: number;
}

type WizardStep = "setup" | "review";

const defaultForm = (): CampaignFormState => ({
  keyword: "",
  targetUrl: "",
  region: "ALL",
  gscConnectionId: null,
  gscSiteUrl: null,
  campaignDurationDays: 14,
  treatmentIntensity: "normal",
  adaptivePacing: true,
  recalculateEveryDays: 3,
  maxShareOfSearchDemand: 0.02,
  maxShareOfGscImpressions: 0.05,
  desktopPercent: 65,
  ctrSource: "default_curve",
  queries: [],
});

function intensityFromPreview(preview: IntensityPreview): IntensitySummary {
  return {
    totalBaselineClicks: preview.totalBaselineClicks,
    totalAllocatedSessions: preview.totalAllocatedSessions,
    suggestedIdentities: preview.suggestedIdentities,
    activeIdentityCount: preview.activeIdentityCount,
    identityDeficit: preview.identityDeficit,
    feasibleSessions: preview.feasibleSessions,
    treatmentMultiplier: preview.treatmentMultiplier,
  };
}

function queriesFromPreview(rows: QueryIntensityRow[]): QueryRow[] {
  return rows.map((q) => ({
    text: q.query,
    type: q.type,
    weight: q.weight,
    monthlySearchVolume: q.monthlySearchVolume,
    startingPosition: q.startingPosition,
    gscImpressions28d: q.gscImpressions28d,
    gscClicks28d: q.gscClicks28d,
    allocatedSessions: q.allocatedSessions,
  }));
}

function suggestSiteFromUrl(targetUrl: string, sites: GscSiteOption[]): string | null {
  if (!targetUrl.trim() || sites.length === 0) return null;
  try {
    const hostname = new URL(targetUrl).hostname.replace(/^www\./, "");
    const match = sites.find((site) => {
      const value = site.siteUrl.toLowerCase();
      return value.includes(hostname.toLowerCase());
    });
    return match?.siteUrl ?? null;
  } catch {
    return null;
  }
}

export default function CampaignDashboard() {
  const [form, setForm] = useState<CampaignFormState>(defaultForm());
  const [step, setStep] = useState<WizardStep>("setup");
  const [rationales, setRationales] = useState<SettingRationale[]>([]);
  const [gscStatus, setGscStatus] = useState<"live" | "unavailable" | null>(null);
  const [intensity, setIntensity] = useState<IntensitySummary | null>(null);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [gscConnections, setGscConnections] = useState<GscConnectionOption[]>([]);
  const [gscSites, setGscSites] = useState<GscSiteOption[]>([]);
  const [gscSitesLoading, setGscSitesLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function applyProposal(proposal: CampaignProposal) {
    setForm({
      keyword: proposal.keyword,
      targetUrl: proposal.targetUrl,
      region: proposal.region,
      gscConnectionId: proposal.gscConnectionId,
      gscSiteUrl: proposal.gscSiteUrl,
      campaignDurationDays: proposal.campaignDurationDays,
      treatmentIntensity: proposal.treatmentIntensity,
      adaptivePacing: proposal.adaptivePacing,
      recalculateEveryDays: proposal.recalculateEveryDays,
      maxShareOfSearchDemand: proposal.maxShareOfSearchDemand,
      maxShareOfGscImpressions: proposal.maxShareOfGscImpressions,
      desktopPercent: proposal.desktopPercent,
      ctrSource: proposal.ctrSource,
      queries: proposal.queries.map((q) => ({
        ...q,
        allocatedSessions:
          proposal.intensity.queries.find((row) => row.query === q.text)?.allocatedSessions ?? null,
      })),
    });
    setIntensity(intensityFromPreview(proposal.intensity));
    setRationales(proposal.rationales);
    setGscStatus(proposal.gscStatus);
    setStep("review");
  }

  function applyCampaign(c: Campaign) {
    setForm({
      keyword: c.keyword,
      targetUrl: c.targetUrl,
      region: c.region,
      gscConnectionId: c.gscConnectionId,
      gscSiteUrl: c.gscSiteUrl,
      campaignDurationDays: c.campaignDurationDays,
      treatmentIntensity: c.treatmentIntensity,
      adaptivePacing: c.adaptivePacing,
      recalculateEveryDays: c.recalculateEveryDays,
      maxShareOfSearchDemand: c.maxShareOfSearchDemand,
      maxShareOfGscImpressions: c.maxShareOfGscImpressions,
      desktopPercent: c.desktopPercent,
      ctrSource: c.ctrSource,
      queries: c.queries,
    });
    setIntensity(c.intensity);
    if (c.keyword && c.targetUrl) {
      setStep("review");
    }
  }

  const loadGscSites = useCallback(async (connectionId: string, targetUrl?: string) => {
    setGscSitesLoading(true);
    try {
      const result = await apiGet<{ sites: GscSiteOption[] }>(`/gsc/connections/${connectionId}/sites`);
      setGscSites(result.sites);
      const suggested = suggestSiteFromUrl(targetUrl ?? form.targetUrl, result.sites);
      if (suggested) {
        setForm((prev) => ({ ...prev, gscConnectionId: connectionId, gscSiteUrl: suggested }));
      }
    } catch {
      setGscSites([]);
    } finally {
      setGscSitesLoading(false);
    }
  }, [form.targetUrl]);

  const loadCampaign = useCallback(async () => {
    const [campaignRes, logRes] = await Promise.all([
      apiGet<{ campaign: Campaign | null; running: boolean }>("/campaign"),
      apiGet<{ entries: LogEntry[] }>("/campaign/log"),
    ]);

    if (campaignRes.campaign) {
      applyCampaign(campaignRes.campaign);
    }

    setRunning(campaignRes.running);
    setLog(logRes.entries);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [regionOptions, connectionsRes] = await Promise.all([
          apiGet<RegionOption[]>("/regions"),
          apiGet<{ connections: GscConnectionOption[] }>("/gsc/connections"),
        ]);
        setRegions(regionOptions);
        setGscConnections(connectionsRes.connections);
        await loadCampaign();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCampaign]);

  useEffect(() => {
    if (!form.gscConnectionId) {
      setGscSites([]);
      return;
    }
    void loadGscSites(form.gscConnectionId, form.targetUrl);
  }, [form.gscConnectionId, loadGscSites]);

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
      keyword: form.keyword,
      targetUrl: form.targetUrl,
      region: form.region,
      gscConnectionId: form.gscConnectionId,
      gscSiteUrl: form.gscSiteUrl,
      campaignDurationDays: form.campaignDurationDays,
      treatmentIntensity: form.treatmentIntensity,
      adaptivePacing: form.adaptivePacing,
      recalculateEveryDays: form.recalculateEveryDays,
      maxShareOfSearchDemand: form.maxShareOfSearchDemand,
      maxShareOfGscImpressions: form.maxShareOfGscImpressions,
      desktopPercent: form.desktopPercent,
      ctrSource: form.ctrSource,
      queries: form.queries.map((q) => ({
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

  function updateForm<K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateQuery(index: number, field: keyof QueryRow, value: string) {
    setForm((prev) => ({
      ...prev,
      queries: prev.queries.map((row, i) => {
        if (i !== index) return row;
        if (field === "text" || field === "type") {
          return { ...row, [field]: value };
        }
        const num = value === "" ? null : Number(value);
        return { ...row, [field]: num };
      }),
    }));
  }

  async function analyzeCampaign() {
    setBusy("analyze");
    setError(null);
    setMessage(null);
    try {
      const result = await apiPost<{ proposal: CampaignProposal }>("/campaign/analyze", {
        keyword: form.keyword,
        targetUrl: form.targetUrl,
        region: form.region,
        gscConnectionId: form.gscConnectionId,
        gscSiteUrl: form.gscSiteUrl,
      });
      applyProposal(result.proposal);
      setMessage("Analysis complete — review settings below");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setBusy(null);
    }
  }

  async function previewIntensity() {
    setBusy("preview");
    setError(null);
    try {
      const result = await apiPost<{ intensity: IntensityPreview }>(
        "/campaign/preview-intensity",
        buildPayload(),
      );
      setIntensity(intensityFromPreview(result.intensity));
      setForm((prev) => ({ ...prev, queries: queriesFromPreview(result.intensity.queries) }));
      setMessage("Preview updated");
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
      const result = await apiPost<{ message: string; intensity: IntensityPreview }>(
        "/campaign/create-identities",
        buildPayload(),
      );
      setIntensity(intensityFromPreview(result.intensity));
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create identities");
    } finally {
      setBusy(null);
    }
  }

  async function saveAndStart() {
    setBusy("run");
    setError(null);
    setMessage(null);
    try {
      await apiPut("/campaign", buildPayload());
      const result = await apiPost<{ campaign: Campaign; running: boolean }>("/campaign/run");
      setRunning(result.running);
      applyCampaign(result.campaign);
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
      applyCampaign(result.campaign);
      setMessage("Campaign stopped");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setBusy(null);
    }
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
      {step === "setup" && !running ? (
        <CampaignSetupStep
          keyword={form.keyword}
          targetUrl={form.targetUrl}
          region={form.region}
          gscConnectionId={form.gscConnectionId}
          gscSiteUrl={form.gscSiteUrl}
          regions={regions}
          connections={gscConnections}
          sites={gscSites}
          sitesLoading={gscSitesLoading}
          busy={busy === "analyze"}
          onKeywordChange={(value) => updateForm("keyword", value)}
          onTargetUrlChange={(value) => updateForm("targetUrl", value)}
          onRegionChange={(value) => updateForm("region", value)}
          onGscConnectionChange={(value) => {
            updateForm("gscConnectionId", value);
            updateForm("gscSiteUrl", null);
          }}
          onGscSiteChange={(value) => updateForm("gscSiteUrl", value)}
          onAnalyze={() => void analyzeCampaign()}
        />
      ) : (
        <CampaignReviewStep
          form={form}
          intensity={intensity}
          rationales={rationales}
          gscStatus={gscStatus}
          running={running}
          busy={busy}
          onFormChange={updateForm}
          onQueryChange={updateQuery}
          onBack={() => setStep("setup")}
          onReanalyze={() => void analyzeCampaign()}
          onPreview={() => void previewIntensity()}
          onCreateIdentities={() => void createIdentities()}
          onSaveAndStart={() => void saveAndStart()}
          onStop={() => void stopCampaign()}
        />
      )}

      {(message || error) && (
        <div style={{ marginTop: 16 }}>
          {message && <p style={{ color: "#16a34a", margin: 0 }}>{message}</p>}
          {error && <p style={{ color: "#b91c1c", margin: message ? "8px 0 0" : 0 }}>{error}</p>}
        </div>
      )}

      <section style={{ ...panelStyle, marginTop: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0 }}>Campaign log</h2>
          <button type="button" onClick={() => void loadCampaign()} style={secondaryButtonStyle}>
            Refresh
          </button>
        </div>

        {log.length === 0 ? (
          <p style={{ color: "#64748b" }}>No sessions yet. Start the campaign to begin searching.</p>
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
