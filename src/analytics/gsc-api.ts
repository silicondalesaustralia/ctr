import { getEnv } from "../config/env.js";

export interface GscLiveRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  country: string;
}

interface SearchAnalyticsResponse {
  rows?: Array<{
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isGscConfigured(): boolean {
  const env = getEnv();
  return Boolean(
    env.GSC_CLIENT_ID &&
      env.GSC_CLIENT_SECRET &&
      env.GSC_REFRESH_TOKEN &&
      env.GSC_SITE_URL,
  );
}

async function refreshAccessToken(): Promise<string> {
  const env = getEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GSC_CLIENT_ID!,
      client_secret: env.GSC_CLIENT_SECRET!,
      refresh_token: env.GSC_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC token refresh failed: ${text}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("GSC token refresh returned no access token");
  }

  return payload.access_token;
}

function normalizePageUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  let path = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.origin}${path}`;
}

function pageUrlCandidates(targetUrl: string): string[] {
  const normalized = normalizePageUrl(targetUrl);
  const parsed = new URL(normalized);
  const withSlash = `${parsed.origin}${parsed.pathname}/`;
  const candidates = new Set([normalized, withSlash, targetUrl.trim()]);

  if (parsed.hostname.startsWith("www.")) {
    const bare = parsed.hostname.replace(/^www\./, "");
    candidates.add(`${parsed.protocol}//${bare}${parsed.pathname}`);
    candidates.add(`${parsed.protocol}//${bare}${parsed.pathname}/`);
  } else {
    candidates.add(`${parsed.protocol}//www.${parsed.hostname}${parsed.pathname}`);
    candidates.add(`${parsed.protocol}//www.${parsed.hostname}${parsed.pathname}/`);
  }

  return [...candidates];
}

async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  body: Record<string, unknown>,
): Promise<SearchAnalyticsResponse> {
  const encodedSite = encodeURIComponent(siteUrl);
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC searchAnalytics query failed: ${text}`);
  }

  return response.json() as Promise<SearchAnalyticsResponse>;
}

export async function fetchGscRowsForPage(
  targetUrl: string,
  lookbackDays = 28,
  country = "aus",
): Promise<GscLiveRow[]> {
  if (!isGscConfigured()) {
    return [];
  }

  const env = getEnv();
  const accessToken = await refreshAccessToken();
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);

  const candidates = pageUrlCandidates(targetUrl);
  const merged = new Map<string, GscLiveRow>();

  for (const page of candidates) {
    const result = await querySearchAnalytics(accessToken, env.GSC_SITE_URL!, {
      startDate: formatDate(start),
      endDate: formatDate(end),
      dimensions: ["query", "page", "country"],
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "page", operator: "equals", expression: page },
            { dimension: "country", operator: "equals", expression: country },
          ],
        },
      ],
      rowLimit: 250,
    });

    for (const row of result.rows ?? []) {
      const query = row.keys[0] ?? "";
      const pageKey = row.keys[1] ?? page;
      const rowCountry = row.keys[2] ?? country;
      if (!query) continue;

      const key = query.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        const totalImpressions = existing.impressions + row.impressions;
        existing.position =
          (existing.position * existing.impressions + row.position * row.impressions) /
          totalImpressions;
        existing.clicks += row.clicks;
        existing.impressions = totalImpressions;
        existing.ctr = totalImpressions > 0 ? existing.clicks / totalImpressions : 0;
      } else {
        merged.set(key, {
          query,
          page: pageKey,
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
          country: rowCountry,
        });
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.impressions - a.impressions);
}

export async function fetchGscSiteCurveRows(lookbackDays = 90): Promise<GscLiveRow[]> {
  if (!isGscConfigured()) {
    return [];
  }

  const env = getEnv();
  const accessToken = await refreshAccessToken();
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);

  const result = await querySearchAnalytics(accessToken, env.GSC_SITE_URL!, {
    startDate: formatDate(start),
    endDate: formatDate(end),
    dimensions: ["query", "country"],
    dimensionFilterGroups: [
      {
        filters: [{ dimension: "country", operator: "equals", expression: "aus" }],
      },
    ],
    rowLimit: 5000,
  });

  return (result.rows ?? []).map((row) => ({
    query: row.keys[0] ?? "",
    page: "",
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    country: row.keys[1] ?? "aus",
  }));
}

export function isGscApiConfigured(): boolean {
  return isGscConfigured();
}
