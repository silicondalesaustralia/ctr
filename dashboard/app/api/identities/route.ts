import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getApiKey, proxyRailwayResponse, railwayFetch } from "../../../lib/railway-proxy";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await railwayFetch("/identities", apiKey);
  return proxyRailwayResponse(response);
}
