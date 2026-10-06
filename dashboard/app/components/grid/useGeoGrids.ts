"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "../../../lib/api";
import { isScanOpen, type GridPoint, type GridScan } from "./grid-types";

const POLL_MS = 20_000;

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Scan list for a campaign; polls while a scan is queued or running. */
export function useGeoGrids(campaignId: string) {
  const [scans, setScans] = useState<GridScan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);

  const load = useCallback(async () => {
    try {
      setScans(await apiGet<GridScan[]>(`/campaigns/${campaignId}/geo-grids`));
      setError(null);
    } catch (err) {
      setError(message(err, "Failed to load coverage grids"));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = scans.some(isScanOpen);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  const runNow = useCallback(async () => {
    setQueueing(true);
    try {
      await apiPost<{ queued: number }>(`/campaigns/${campaignId}/geo-grids`);
      await load();
    } catch (err) {
      setError(message(err, "Failed to queue a grid scan"));
    } finally {
      setQueueing(false);
    }
  }, [campaignId, load]);

  return { scans, error, loading, queueing, runNow, open };
}

/** Points of one scan; refetches on status change and polls while the scan is running. */
export function useGridPoints(scan: GridScan | undefined) {
  const [points, setPoints] = useState<GridPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const scanId = scan?.id;
  const scanOpen = scan ? isScanOpen(scan) : false;
  const version = scan ? `${scan.status}-${scan.completedAt ?? ""}-${tick}` : "";

  useEffect(() => {
    if (!scanOpen) return;
    const timer = setInterval(() => setTick((value) => value + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [scanOpen]);

  useEffect(() => {
    if (!scanId) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    apiGet<GridPoint[]>(`/geo-grids/${scanId}`)
      .then((rows) => {
        if (!cancelled) {
          setPoints(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(message(err, "Failed to load grid points"));
      });
    return () => {
      cancelled = true;
    };
  }, [scanId, version]);

  return { points, error };
}
