import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function apiOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

export function getApiKey(request: NextRequest): string | null {
  return request.headers.get("x-api-key")?.trim() ?? null;
}

export async function railwayFetch(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("x-api-key", apiKey);
  if (init?.body) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${apiOrigin()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function proxyRailwayResponse(response: Response): Promise<NextResponse> {
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

interface LegacyCampaign {
  id?: string;
  name?: string;
  status?: string;
  keyword?: string;
  targetUrl?: string;
  region?: string;
  campaignDurationDays?: number;
  monthlySessionTarget?: number;
  queries?: unknown[];
  intensity?: { totalAllocatedSessions?: number } | null;
}

interface LegacyCampaignResponse {
  campaign: LegacyCampaign | null;
  running: boolean;
}

export function legacyCampaignToSummary(campaign: LegacyCampaign) {
  return {
    id: campaign.id ?? "legacy",
    name: campaign.name ?? campaign.keyword ?? "Campaign",
    status: campaign.status ?? "draft",
    keyword: campaign.keyword ?? "",
    targetUrl: campaign.targetUrl ?? "",
    region: campaign.region ?? "ALL",
    campaignDurationDays: campaign.campaignDurationDays ?? 14,
    monthlySessionTarget:
      campaign.monthlySessionTarget ??
      campaign.intensity?.totalAllocatedSessions ??
      0,
    queryCount: campaign.queries?.length ?? 0,
    completedSessions: 0,
    scheduledSessions: 0,
    updatedAt: new Date().toISOString(),
    startDate: null,
    endDate: null,
  };
}

export async function fetchLegacyCampaign(apiKey: string): Promise<LegacyCampaignResponse | null> {
  const response = await railwayFetch("/campaign", apiKey);
  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<LegacyCampaignResponse>;
}
