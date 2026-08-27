import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  fetchLegacyCampaign,
  getApiKey,
  legacyCampaignToSummary,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../lib/railway-proxy";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let response: Response;
  try {
    response = await railwayFetch("/campaigns", apiKey);
  } catch {
    return NextResponse.json(
      { error: `Cannot reach API at ${process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "Railway"}` },
      { status: 502 },
    );
  }
  if (response.ok) {
    return proxyRailwayResponse(response);
  }

  if (response.status === 404) {
    const legacy = await fetchLegacyCampaign(apiKey);
    if (!legacy?.campaign) {
      return NextResponse.json({ campaigns: [], running: false, activeCount: 0 });
    }

    const activeCount =
      legacy.campaign.status === "active" && legacy.running ? 1 : 0;
    return NextResponse.json({
      campaigns: [legacyCampaignToSummary(legacy.campaign)],
      running: legacy.running,
      activeCount,
    });
  }

  return proxyRailwayResponse(response);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const response = await railwayFetch("/campaigns", apiKey, {
    method: "POST",
    body,
  });

  if (response.ok) {
    return proxyRailwayResponse(response);
  }

  if (response.status === 404) {
    const legacyResponse = await railwayFetch("/campaign", apiKey, {
      method: "PUT",
      body,
    });
    return proxyRailwayResponse(legacyResponse);
  }

  return proxyRailwayResponse(response);
}
