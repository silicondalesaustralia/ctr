"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../../lib/api";
import type { CampaignAction, CampaignSummary } from "./campaign-list-types";

/** Picks up each finished session's rank without a manual reload. */
const REFRESH_MS = 30_000;

const failureMessages: Record<CampaignAction, string> = {
  start: "Failed to start campaign",
  stop: "Failed to stop campaign",
  delete: "Failed to delete campaign",
  rank: "Failed to queue position check",
};

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: CampaignAction } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiGet<{
        campaigns: CampaignSummary[];
        activeCount: number;
        running: boolean;
      }>("/campaigns");
      setCampaigns(result.campaigns);
      setActiveCount(result.activeCount);
      setLastLoaded(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(id: string, action: CampaignAction, request: () => Promise<unknown>) {
    setBusy({ id, action });
    setError(null);
    try {
      await request();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : failureMessages[action]);
    } finally {
      setBusy(null);
    }
  }

  function startCampaign(id: string) {
    void run(id, "start", () => apiPost(`/campaigns/${id}/run`));
  }

  function stopCampaign(id: string) {
    void run(id, "stop", () => apiPost(`/campaigns/${id}/stop`));
  }

  function deleteCampaign(id: string, label: string) {
    const name = label.trim() || "this campaign";
    if (
      !window.confirm(
        `Delete "${name}"? This removes the campaign, scheduled sessions, and session history. This cannot be undone.`,
      )
    ) {
      return;
    }
    void run(id, "delete", () => apiDelete(`/campaigns/${id}`));
  }

  function updateRank(id: string) {
    void run(id, "rank", () => apiPost(`/campaigns/${id}/rank-snapshots`));
  }

  async function updateAllRanks() {
    setUpdatingAll(true);
    setError(null);
    try {
      await apiPost<{ campaigns: number }>("/rank-snapshots/run-all");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue position checks");
    } finally {
      setUpdatingAll(false);
    }
  }

  return {
    campaigns,
    activeCount,
    loading,
    lastLoaded,
    busy,
    error,
    updatingAll,
    startCampaign,
    stopCampaign,
    deleteCampaign,
    updateRank,
    updateAllRanks,
  };
}
