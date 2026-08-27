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

function queriesFromPreview(
  rows: QueryIntensityRow[],
  existing: QueryRow[] = [],
): QueryRow[] {
  const existingByText = new Map(existing.map((row) => [row.text.toLowerCase(), row]));
  return rows.map((q) => {
    const prev = existingByText.get(q.query.toLowerCase());
    return {
      text: q.query,
      type: q.type,
      weight: q.weight,
      active: prev?.active ?? true,
      monthlySearchVolume: q.monthlySearchVolume,
      startingPosition: q.startingPosition,
      gscImpressions28d: q.gscImpressions28d,
      gscClicks28d: q.gscClicks28d,
      allocatedSessions: q.allocatedSessions,
      preflightFound: prev?.preflightFound,
      preflightSerpPage: prev?.preflightSerpPage,
      preflightPosition: prev?.preflightPosition,
      preflightStatus: prev?.preflightStatus,
    };
  });
}

function mergeProposalQueries(
  proposal: CampaignProposal,
  existing: QueryRow[] = [],
): QueryRow[] {
  const existingByText = new Map(existing.map((row) => [row.text.toLowerCase(), row]));
  return proposal.queries.map((q) => {
    const prev = existingByText.get(q.text.toLowerCase());
    const pf = proposal.preflight?.results.find(
      (item) => item.query.toLowerCase() === q.text.toLowerCase(),
    );
    return {
      text: q.text,
      type: q.type,
      weight: q.weight,
      active: q.active === false ? false : (prev?.active ?? true),
      monthlySearchVolume: q.monthlySearchVolume ?? null,
      startingPosition: q.startingPosition ?? null,
      gscImpressions28d: q.gscImpressions28d ?? null,
      gscClicks28d: q.gscClicks28d ?? null,
      allocatedSessions:
        proposal.intensity.queries.find((row) => row.query === q.text)?.allocatedSessions ?? null,
      preflightFound: pf?.found,
      preflightSerpPage: pf?.serpPage,
      preflightPosition: pf?.position,
      preflightStatus: pf?.status,
    };
  });
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

  function applyProposal(proposal: CampaignProposal | null | undefined) {
    if (!proposal?.keyword?.trim()) {
      throw new Error("Server returned an invalid campaign proposal");
    }
    setForm((prev) => ({
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
      queries: mergeProposalQueries(proposal, prev.queries),
      plannedSessionCap: proposal.plannedSessionCap ?? proposal.intensity.totalAllocatedSessions,
      targetIdentityCount: proposal.targetIdentityCount ?? proposal.intensity.suggestedIdentities,
      organicMaxSessionsPerIdentity: proposal.organicMaxSessionsPerIdentity ?? 2,
    }));
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
      queries: c.queries.map((q) => ({
        ...q,
        active: q.active ?? true,
      })),
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
        active: q.active,
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

  function toggleQueryActive(index: number, active: boolean) {
    setForm((prev) => ({
      ...prev,
      queries: prev.queries.map((row, i) => (i === index ? { ...row, active } : row)),
    }));
  }

  async function runPreflight() {
    setBusy("preflight");
    setError(null);
    setMessage("Starting Google validation...");
    try {
      const start = await apiPost<{ jobId?: string; totalCount?: number; proposal?: CampaignProposal }>(
        "/campaign/preflight",
        buildPayload(),
      );

      if (start.proposal) {
        applyProposal(start.proposal);
        if (start.proposal.preflight?.status === "blocked") {
          setMessage("Google blocked preflight — try again later");
        } else if (start.proposal.preflight?.findableCount === 0) {
          setMessage("No queries were findable on Google within 3 pages");
        } else {
          setMessage(
            start.proposal.preflight?.keywordAdjusted
              ? `Preflight complete — keyword updated to "${start.proposal.keyword}"`
              : "Preflight complete — live Google ranks added; GSC data unchanged",
          );
        }
        return;
      }

      if (!start.jobId) {
        throw new Error("Unexpected preflight response — refresh the page and retry");
      }

      const pollIntervalMs = 3000;
      const queryCount = start.totalCount ?? form.queries.length ?? 5;
      const estimatedMs = 120_000 + queryCount * 120_000;
      const maxAttempts = Math.max(200, Math.ceil(estimatedMs / pollIntervalMs));

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        const job = await apiGet<{
          status: "running" | "complete" | "error";
          testedCount: number;
          totalCount: number;
          proposal: CampaignProposal | null;
          error: string | null;
        }>(`/campaign/preflight/jobs/${start.jobId}`);

        if (job.status === "running") {
          const progress =
            job.testedCount === 0
              ? "Starting GoLogin browser on Railway..."
              : `Checking Google... ${job.testedCount}/${job.totalCount} queries`;
          setMessage(`${progress} (about 2 min per query)`);
          continue;
        }

        if (job.status === "error") {
          throw new Error(job.error ?? "Google preflight failed");
        }

        if (!job.proposal) {
          throw new Error("Preflight finished without a proposal");
        }

        applyProposal(job.proposal);
        if (job.proposal.preflight?.status === "blocked") {
          setMessage("Google blocked preflight — try again later");
        } else if (job.proposal.preflight?.findableCount === 0) {
          setMessage("No queries were findable on Google within 3 pages");
        } else {
          setMessage(
            job.proposal.preflight?.keywordAdjusted
              ? `Preflight complete — keyword updated to "${job.proposal.keyword}"`
              : "Preflight complete — live Google ranks added; GSC data unchanged",
          );
        }
        return;
      }

      throw new Error(
        `Preflight timed out after ${Math.round((maxAttempts * pollIntervalMs) / 60_000)} minutes — retry or reduce query count`,
      );
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
      const result = await apiPost<{ proposal?: CampaignProposal }>("/campaign/analyze", {
        keyword: form.keyword,
        targetUrl: form.targetUrl,
        region: form.region,
        gscConnectionId: form.gscConnectionId,
        gscSiteUrl: form.gscSiteUrl,
      });
      if (!result?.proposal) {
        throw new Error("Analysis did not return a campaign proposal");
      }
      applyProposal(result.proposal);
      setMessage("Analysis complete — review the plan, then validate on Google when ready.");
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
      setForm((prev) => ({
        ...prev,
        queries: queriesFromPreview(result.intensity.queries, prev.queries),
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

  async function saveCampaignRecord(): Promise<{ id: string; campaign: Campaign }> {
    const payload = buildPayload();
    if (isNew) {
      const result = await apiPost<{ campaign: Campaign }>("/campaigns", payload);
      return { id: result.campaign.id, campaign: result.campaign };
    }
    if (!campaignId) {
      throw new Error("Campaign id is missing");
    }
    const result = await apiPut<{ campaign: Campaign }>(`/campaigns/${campaignId}`, payload);
    return { id: campaignId, campaign: result.campaign };
  }

  async function saveCampaign() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const { id, campaign } = await saveCampaignRecord();
      if (isNew) {
        router.replace(`/campaign/${id}`);
      }
      applyCampaign(campaign);
      setMessage("Campaign saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setBusy(null);
    }
  }

  async function saveAndStart() {
    setBusy("run");
    setError(null);
    setMessage(null);
    try {
      const { id, campaign } = await saveCampaignRecord();
      if (isNew) {
        router.replace(`/campaign/${id}`);
      } else {
        applyCampaign(campaign);
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
          onToggleQueryActive={toggleQueryActive}
          onBack={() => setStep("setup")}
          onReanalyze={() => void analyzeCampaign()}
          onPreflight={() => void runPreflight()}
          onPreview={() => void previewIntensity()}
          onCreateIdentities={() => void createIdentities()}
          onSave={() => void saveCampaign()}
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
