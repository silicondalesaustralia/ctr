import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  fetchLegacyCampaign,
  getApiKey,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../../../lib/railway-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await railwayFetch(`/campaigns/${id}/identities`, apiKey);

  if (response.ok) {
    return proxyRailwayResponse(response);
  }

  if (response.status === 404) {
    const legacy = await fetchLegacyCampaign(apiKey);
    if (!legacy?.campaign || legacy.campaign.id !== id) {
      return NextResponse.json({ identities: [] });
    }

    const pool = await railwayFetch("/identities", apiKey);
    if (!pool.ok) {
      return proxyRailwayResponse(pool);
    }

    const all = (await pool.json()) as Array<{
      id: string;
      externalId: string;
      region: string;
      city: string;
      deviceClass: string;
      personaId: string | null;
      active: boolean;
    }>;

    const focusRegion = legacy.campaign.region;
    const identities = all
      .filter((row) => !focusRegion || focusRegion === "ALL" || row.region === focusRegion)
      .map((row) => ({
        id: row.id,
        externalId: row.externalId,
        region: row.region,
        city: row.city,
        deviceClass: row.deviceClass,
        personaId: row.personaId,
        active: row.active,
        campaignSessions: 0,
        campaignClicks: 0,
        campaignBlocked: 0,
        lastUsedForCampaign: null,
        inRegionPool: true,
      }));

    return NextResponse.json({ identities });
  }

  return proxyRailwayResponse(response);
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.text();
  const response = await railwayFetch(`/campaigns/${id}/identities`, apiKey, {
    method: "PUT",
    body,
    headers: { "Content-Type": "application/json" },
  });

  return proxyRailwayResponse(response);
}
