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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const campaignKind = body.campaignKind === "gmb" ? "gmb" : "url";
  const keyword = typeof body.keyword === "string" ? body.keyword : "";

  if (campaignKind === "gmb") {
    const focusCity = typeof body.focusCity === "string" ? body.focusCity : "";
    const gmbBusinessName =
      typeof body.gmbBusinessName === "string" ? body.gmbBusinessName : "";
    const gmbMapsUrl =
      typeof body.gmbMapsUrl === "string"
        ? body.gmbMapsUrl
        : typeof body.targetUrl === "string"
          ? body.targetUrl
          : "";
    if (!keyword.trim() || !focusCity.trim() || !gmbBusinessName.trim() || !gmbMapsUrl.trim()) {
      return NextResponse.json(
        { error: "keyword, focusCity, gmbBusinessName, and Maps URL are required" },
        { status: 400 },
      );
    }
  } else {
    const targetUrl = typeof body.targetUrl === "string" ? body.targetUrl : "";
    const region = typeof body.region === "string" ? body.region : "";
    if (!keyword.trim() || !targetUrl.trim() || !region.trim()) {
      return NextResponse.json(
        { error: "keyword, targetUrl, and region are required" },
        { status: 400 },
      );
    }
    try {
      new URL(targetUrl);
    } catch {
      return NextResponse.json({ error: "targetUrl must be a valid URL" }, { status: 400 });
    }
  }

  try {
    const proposal = await buildCampaignProposalViaRailway(apiOrigin(), apiKey, body as never);
    return NextResponse.json({ proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.toLowerCase().includes("unauthorized") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
