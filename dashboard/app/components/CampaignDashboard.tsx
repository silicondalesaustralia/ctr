"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost, apiPut } from "../../lib/api";
import AppLayout from "./AppLayout";
import CampaignIdentitiesTab from "./campaign/CampaignIdentitiesTab";
import CampaignReviewStep from "./campaign/CampaignReviewStep";
import CampaignSessionsTab from "./campaign/CampaignSessionsTab";
import CampaignSetupStep from "./campaign/CampaignSetupStep";
import CampaignTabBar from "./campaign/CampaignTabBar";
import type { GscConnectionOption, GscSiteOption } from "./campaign/CampaignSetupStep";
import type {
  CampaignFormState,
  CampaignTab,
  IntensitySummary,
  PreflightSummary,
  QueryRow,
  RegionOption,
  SettingRationale,
} from "./campaign/shared";

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
  preflight?: PreflightSummary;
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
  monthlySessionTarget: number;
  queries: QueryRow[];
  intensity: IntensitySummary | null;
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
  plannedSessionCap: null,
  targetIdentityCount: null,
  organicMaxSessionsPerIdentity: 2,
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

export default function CampaignDashboard({
  campaignId,
  isNew = false,
}: {
  campaignId?: string;
  isNew?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: CampaignTab =
    searchParams.get("tab") === "sessions" || searchParams.get("tab") === "identities"
      ? (searchParams.get("tab") as CampaignTab)
      : "plan";

  function setActiveTab(tab: CampaignTab) {
    if (!campaignId) return;
    router.replace(`/campaign/${campaignId}?tab=${tab}`);
  }

  const [form, setForm] = useState<CampaignFormState>(defaultForm());
  const [step, setStep] = useState<WizardStep>("setup");
  const [rationales, setRationales] = useState<SettingRationale[]>([]);
  const [gscStatus, setGscStatus] = useState<"live" | "unavailable" | null>(null);
  const [preflightSummary, setPreflightSummary] = useState<PreflightSummary | null>(null);
  const [intensity, setIntensity] = useState<IntensitySummary | null>(null);
  const [campaignActive, setCampaignActive] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState("draft");
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [gscConnections, setGscConnections] = useState<GscConnectionOption[]>([]);
  const [gscSites, setGscSites] = useState<GscSiteOption[]>([]);
  const [gscSitesLoading, setGscSitesLoading] = useState(false);
  const [running, setRunning] = useState(false);
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
      plannedSessionCap: proposal.plannedSessionCap ?? proposal.intensity.totalAllocatedSessions,
      targetIdentityCount: proposal.targetIdentityCount ?? proposal.intensity.suggestedIdentities,
      organicMaxSessionsPerIdentity: proposal.organicMaxSessionsPerIdentity ?? 2,
    });
    setIntensity(intensityFromPreview(proposal.intensity));
    setRationales(proposal.rationales);
    setGscStatus(proposal.gscStatus);
    setPreflightSummary(proposal.preflight ?? null);
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
      plannedSessionCap: c.intensity?.totalAllocatedSessions ?? c.monthlySessionTarget ?? null,
      targetIdentityCount: c.intensity?.suggestedIdentities ?? null,
      organicMaxSessionsPerIdentity: 2,
    });
    setIntensity(c.intensity);
    setCampaignActive(c.status === "active");
    setCampaignStatus(c.status);
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
    if (isNew || !campaignId) return;

    const campaignRes = await apiGet<{ campaign: Campaign; running: boolean }>(
      `/campaigns/${campaignId}`,
    );

    if (campaignRes.campaign) {
      applyCampaign(campaignRes.campaign);
    }

    setRunning(campaignRes.running);
    setCampaignActive(campaignRes.campaign.status === "active");
  }, [campaignId, isNew]);

  useEffect(() => {
    void (async () => {
      try {
        const [regionOptions, connectionsRes] = await Promise.all([
          apiGet<RegionOption[]>("/regions"),
          apiGet<{ connections: GscConnectionOption[] }>("/gsc/connections"),
        ]);
        setRegions(regionOptions);
        setGscConnections(connectionsRes.connections);
        if (!isNew) {
          await loadCampaign();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCampaign, isNew]);

  useEffect(() => {
    if (!form.gscConnectionId) {
      setGscSites([]);
      return;
    }
    void loadGscSites(form.gscConnectionId, form.targetUrl);
  }, [form.gscConnectionId, loadGscSites]);

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
      plannedSessionCap: form.plannedSessionCap,
      targetIdentityCount: form.targetIdentityCount,
      organicMaxSessionsPerIdentity: form.organicMaxSessionsPerIdentity,
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

  async function runPreflight() {
    setBusy("preflight");
    setError(null);
    setMessage("Validating queries on Google — this can take a few minutes...");
    try {
      const result = await apiPost<{ proposal: CampaignProposal }>(
        "/campaign/preflight",
        buildPayload(),
      );
      applyProposal(result.proposal);
      if (result.proposal.preflight?.status === "blocked") {
        setMessage("Google blocked preflight — try again later");
      } else if (result.proposal.preflight?.findableCount === 0) {
        setMessage("No queries were findable on Google within 3 pages");
      } else {
        setMessage(
          result.proposal.preflight?.keywordAdjusted
            ? `Preflight complete — keyword updated to "${result.proposal.keyword}"`
            : "Preflight complete — plan recalculated from findable queries",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google preflight failed");
    } finally {
      setBusy(null);
    }
  }

  async function analyzeCampaign() {
    setBusy("analyze");
    setError(null);
    setMessage(null);
    setPreflightSummary(null);
    try {
      const result = await apiPost<{ proposal: CampaignProposal }>("/campaign/analyze", {
        keyword: form.keyword,
        targetUrl: form.targetUrl,
        region: form.region,
        gscConnectionId: form.gscConnectionId,
        gscSiteUrl: form.gscSiteUrl,
      });
      applyProposal(result.proposal);
      setMessage("Analysis complete — validating queries on Google...");
      await runPreflight();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
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
      setForm((prev) => ({
        ...prev,
        queries: queriesFromPreview(result.intensity.queries),
        plannedSessionCap: result.intensity.totalAllocatedSessions,
        targetIdentityCount: result.intensity.suggestedIdentities,
      }));
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
        { ...buildPayload(), experimentId: campaignId ?? null },
      );
      setIntensity(intensityFromPreview(result.intensity));
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create identities");
    } finally {
      setBusy(null);
    }
  }

  async function saveCampaignRecord(): Promise<string> {
    const payload = buildPayload();
    if (isNew) {
      const result = await apiPost<{ campaign: Campaign }>("/campaigns", payload);
      return result.campaign.id;
    }
    if (!campaignId) {
      throw new Error("Campaign id is missing");
    }
    await apiPut(`/campaigns/${campaignId}`, payload);
    return campaignId;
  }

  async function saveAndStart() {
    setBusy("run");
    setError(null);
    setMessage(null);
    try {
      const id = await saveCampaignRecord();
      if (isNew) {
        router.replace(`/campaign/${id}`);
      }
      const result = await apiPost<{ campaign: Campaign; running: boolean }>(
        `/campaigns/${id}/run`,
      );
      setRunning(result.running);
      setCampaignActive(true);
      applyCampaign(result.campaign);
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start campaign");
    } finally {
      setBusy(null);
    }
  }

  async function stopCampaignHandler() {
    if (!campaignId) return;
    setBusy("stop");
    setError(null);
    setMessage(null);
    try {
      const result = await apiPost<{ campaign: Campaign; running: boolean }>(
        `/campaigns/${campaignId}/stop`,
      );
      setRunning(result.running);
      setCampaignActive(false);
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
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          ← All campaigns
        </Link>
      </p>

      {campaignId && !isNew && (
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>{form.keyword || "Campaign"}</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            {form.targetUrl} · {form.region}
            {campaignActive ? " · Running" : ` · ${campaignStatus}`}
          </p>
        </div>
      )}

      {campaignId && !isNew && (
        <CampaignTabBar active={activeTab} onChange={setActiveTab} showPlan />
      )}

      {activeTab === "sessions" && campaignId ? (
        <CampaignSessionsTab campaignId={campaignId} />
      ) : activeTab === "identities" && campaignId ? (
        <CampaignIdentitiesTab campaignId={campaignId} regionLabel={form.region} />
      ) : step === "setup" && !campaignActive ? (
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
          preflightSummary={preflightSummary}
          running={campaignActive}
          busy={busy}
          message={message}
          error={error}
          onFormChange={updateForm}
          onQueryChange={updateQuery}
          onBack={() => setStep("setup")}
          onReanalyze={() => void analyzeCampaign()}
          onPreflight={() => void runPreflight()}
          onPreview={() => void previewIntensity()}
          onCreateIdentities={() => void createIdentities()}
          onSaveAndStart={() => void saveAndStart()}
          onStop={() => void stopCampaignHandler()}
        />
      )}

      {(message || error) && (
        <div style={{ marginTop: 16 }}>
          {message && <p style={{ color: "#16a34a", margin: 0 }}>{message}</p>}
          {error && <p style={{ color: "#b91c1c", margin: message ? "8px 0 0" : 0 }}>{error}</p>}
        </div>
      )}
    </AppLayout>
  );
}
