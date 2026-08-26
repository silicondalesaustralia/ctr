import { randomBytes } from "node:crypto";
import { getEnv } from "../config/env.js";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly email";

export function isGscOAuthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GSC_CLIENT_ID && env.GSC_CLIENT_SECRET && env.GSC_OAUTH_REDIRECT_URI);
}

export function buildGscOAuthUrl(state: string): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GSC_CLIENT_ID!,
    redirect_uri: env.GSC_OAUTH_REDIRECT_URI!,
    response_type: "code",
    scope: GSC_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function createOAuthStateToken(): string {
  return randomBytes(24).toString("hex");
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
}> {
  const env = getEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GSC_CLIENT_ID!,
      client_secret: env.GSC_CLIENT_SECRET!,
      redirect_uri: env.GSC_OAUTH_REDIRECT_URI!,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC OAuth token exchange failed: ${text}`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!payload.access_token) {
    throw new Error("GSC OAuth token exchange returned no access token");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const env = getEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GSC_CLIENT_ID!,
      client_secret: env.GSC_CLIENT_SECRET!,
      refresh_token: refreshToken,
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

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { email?: string };
  return payload.email ?? null;
}

export interface GscSiteListing {
  siteUrl: string;
  permissionLevel: string;
}

export async function fetchGscSiteList(accessToken: string): Promise<GscSiteListing[]> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GSC site list failed: ${text}`);
  }

  const payload = (await response.json()) as {
    siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
  };

  return (payload.siteEntry ?? [])
    .filter((entry) => entry.siteUrl)
    .map((entry) => ({
      siteUrl: entry.siteUrl!,
      permissionLevel: entry.permissionLevel ?? "unknown",
    }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export function getDashboardRedirectUrl(path = "/gsc"): string {
  const env = getEnv();
  const base = (env.DASHBOARD_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
