import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getApiKey,
  proxyRailwayResponse,
  railwayFetch,
} from "../../../../lib/railway-proxy";

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
    return NextResponse.json(
      {
        error:
          "Google preflight is not available on the API yet. Redeploy Railway from main (commit 39fa807+) then retry.",
      },
      { status: 503 },
    );
  }

  return proxyRailwayResponse(response);
}
