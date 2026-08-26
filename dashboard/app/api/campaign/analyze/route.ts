import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildCampaignProposalViaRailway } from "../../../../lib/campaign-analyze";

function apiOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = request.headers.get("x-api-key")?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    keyword?: string;
    targetUrl?: string;
    region?: string;
    gscConnectionId?: string | null;
    gscSiteUrl?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.keyword?.trim() || !body.targetUrl?.trim() || !body.region?.trim()) {
    return NextResponse.json(
      { error: "keyword, targetUrl, and region are required" },
      { status: 400 },
    );
  }

  try {
    new URL(body.targetUrl);
  } catch {
    return NextResponse.json({ error: "targetUrl must be a valid URL" }, { status: 400 });
  }

  try {
    const proposal = await buildCampaignProposalViaRailway(apiOrigin(), apiKey, {
      keyword: body.keyword,
      targetUrl: body.targetUrl,
      region: body.region,
      gscConnectionId: body.gscConnectionId ?? null,
      gscSiteUrl: body.gscSiteUrl ?? null,
    });
    return NextResponse.json({ proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.toLowerCase().includes("unauthorized") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
