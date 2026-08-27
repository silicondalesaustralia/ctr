import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  fetchLegacyCampaign,
  getApiKey,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../../../lib/railway-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const response = await railwayFetch(`/campaigns/${id}/stop`, apiKey, {
    method: "POST",
  });

  if (response.ok) {
    return proxyRailwayResponse(response);
  }

  if (response.status === 404) {
    const legacy = await fetchLegacyCampaign(apiKey);
    if (legacy?.campaign?.id === id) {
      const legacyResponse = await railwayFetch("/campaign/stop", apiKey, {
        method: "POST",
      });
      return proxyRailwayResponse(legacyResponse);
    }
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return proxyRailwayResponse(response);
}
