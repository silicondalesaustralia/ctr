import { PRODUCTION_RAILWAY_API } from "./api-origin";

export interface RailwayHealth {
  ok: boolean;
  commit: string | null;
  features: string[];
}

export async function fetchRailwayHealth(origin?: string): Promise<RailwayHealth | null> {
  const base = (origin ?? PRODUCTION_RAILWAY_API).replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/health`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as RailwayHealth;
  } catch {
    return null;
  }
}

export function preflightUnavailableMessage(health: RailwayHealth | null): string {
  const commit = health?.commit ?? "unknown";
  const hasPreflight = health?.features?.includes("campaign-preflight") ?? false;

  if (hasPreflight) {
    return "Google preflight failed on the API. Check Railway logs and retry.";
  }

  return (
    `Railway API is stale (commit ${commit}, preflight needs 1ac843f+). ` +
    "Open Railway → API service → Deployments → Redeploy from main, wait ~3 min, then retry."
  );
}
