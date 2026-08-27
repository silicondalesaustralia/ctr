import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getApiKey,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../../../../lib/railway-proxy";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;
  const response = await railwayFetch(`/campaign/preflight/jobs/${jobId}`, apiKey);
  return proxyRailwayResponse(response);
}
