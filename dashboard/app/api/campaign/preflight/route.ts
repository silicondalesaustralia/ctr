import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { fetchRailwayHealth, preflightUnavailableMessage } from "../../../../lib/railway-health";
import {
  apiOrigin,
  getApiKey,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../../lib/railway-proxy";

export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const response = await railwayFetch("/campaign/preflight", apiKey, {
    method: "POST",
    body,
  });

  if (response.status === 404) {
    const health = await fetchRailwayHealth(apiOrigin());
    return NextResponse.json({ error: preflightUnavailableMessage(health) }, { status: 503 });
  }

  return proxyRailwayResponse(response);
}
