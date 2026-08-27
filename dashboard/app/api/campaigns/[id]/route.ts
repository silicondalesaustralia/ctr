import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  fetchLegacyCampaign,
  getApiKey,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../../lib/railway-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await railwayFetch(`/campaigns/${id}`, apiKey);

  if (response.ok) {
    return proxyRailwayResponse(response);
  }

  if (response.status === 404) {
    const legacy = await fetchLegacyCampaign(apiKey);
    if (legacy?.campaign?.id === id) {
      return NextResponse.json({
        campaign: legacy.campaign,
        running: legacy.running && legacy.campaign.status === "active",
      });
    }
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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
  const response = await railwayFetch(`/campaigns/${id}`, apiKey, {
    method: "PUT",
    body,
  });

  if (response.ok) {
    return proxyRailwayResponse(response);
  }

  if (response.status === 404) {
    const legacy = await fetchLegacyCampaign(apiKey);
    if (legacy?.campaign?.id === id) {
      const legacyResponse = await railwayFetch("/campaign", apiKey, {
        method: "PUT",
        body,
      });
      return proxyRailwayResponse(legacyResponse);
    }
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return proxyRailwayResponse(response);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await railwayFetch(`/campaigns/${id}`, apiKey, {
    method: "DELETE",
  });

  return proxyRailwayResponse(response);
}
