import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getApiKey, proxyRailwayResponse, railwayFetch } from "../../../../../lib/railway-proxy";

type RouteContext = { params: Promise<{ id: string; action: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = await context.params;
  if (action !== "enable" && action !== "disable") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const response = await railwayFetch(`/identities/${id}/${action}`, apiKey, {
    method: "POST",
  });
  return proxyRailwayResponse(response);
}
