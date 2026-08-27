import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getApiKey, proxyRailwayResponse, railwayFetch } from "../../../../lib/railway-proxy";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();
  const response = await railwayFetch("/identities/create", apiKey, {
    method: "POST",
    body,
  });
  return proxyRailwayResponse(response);
}
