import type { GscConnection } from "@prisma/client";
import { prisma } from "../db/client.js";
import { getEnv } from "../config/env.js";
import {
  createOAuthStateToken,
  exchangeCodeForTokens,
  fetchGoogleEmail,
  fetchGscSiteList,
  refreshAccessToken,
  type GscSiteListing,
} from "./gsc-oauth.js";

export interface GscApiContext {
  refreshToken: string;
  siteUrl: string;
}

const OAUTH_STATE_PREFIX = "gsc_oauth_state:";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function createOAuthState(): Promise<string> {
  const state = createOAuthStateToken();
  await prisma.appSetting.upsert({
    where: { key: `${OAUTH_STATE_PREFIX}${state}` },
    update: { value: String(Date.now()) },
    create: { key: `${OAUTH_STATE_PREFIX}${state}`, value: String(Date.now()) },
  });
  return state;
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  const key = `${OAUTH_STATE_PREFIX}${state}`;
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  if (!setting) {
    return false;
  }

  await prisma.appSetting.delete({ where: { key } }).catch(() => undefined);

  const createdAt = Number(setting.value);
  if (!Number.isFinite(createdAt)) {
    return false;
  }

  return Date.now() - createdAt <= OAUTH_STATE_TTL_MS;
}

export async function completeOAuthConnection(code: string): Promise<GscConnection> {
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refreshToken) {
    throw new Error(
      "Google did not return a refresh token. Revoke app access in your Google account and try again.",
    );
  }

  const email = await fetchGoogleEmail(tokens.accessToken);
  const label = email ?? "GSC account";

  return prisma.gscConnection.create({
    data: {
      label,
      googleEmail: email,
      refreshToken: tokens.refreshToken,
    },
  });
}

export async function listGscConnections(): Promise<
  Array<{
    id: string;
    label: string;
    googleEmail: string | null;
    createdAt: string;
  }>
> {
  const connections = await prisma.gscConnection.findMany({
    orderBy: { createdAt: "desc" },
  });

  return connections.map((connection) => ({
    id: connection.id,
    label: connection.label,
    googleEmail: connection.googleEmail,
    createdAt: connection.createdAt.toISOString(),
  }));
}

export async function deleteGscConnection(connectionId: string): Promise<void> {
  await prisma.gscConnection.delete({ where: { id: connectionId } });
}

export async function getGscConnection(connectionId: string): Promise<GscConnection | null> {
  return prisma.gscConnection.findUnique({ where: { id: connectionId } });
}

export async function listSitesForConnection(connectionId: string): Promise<GscSiteListing[]> {
  const connection = await getGscConnection(connectionId);
  if (!connection) {
    throw new Error("GSC connection not found");
  }

  const accessToken = await refreshAccessToken(connection.refreshToken);
  return fetchGscSiteList(accessToken);
}

export async function resolveGscContext(
  connectionId?: string | null,
  siteUrl?: string | null,
): Promise<GscApiContext | null> {
  if (connectionId && siteUrl) {
    const connection = await getGscConnection(connectionId);
    if (!connection) {
      throw new Error("Selected GSC connection not found");
    }
    return {
      refreshToken: connection.refreshToken,
      siteUrl,
    };
  }

  const env = getEnv();
  if (env.GSC_REFRESH_TOKEN && siteUrl) {
    return {
      refreshToken: env.GSC_REFRESH_TOKEN,
      siteUrl,
    };
  }

  if (env.GSC_REFRESH_TOKEN && env.GSC_SITE_URL) {
    return {
      refreshToken: env.GSC_REFRESH_TOKEN,
      siteUrl: env.GSC_SITE_URL,
    };
  }

  return null;
}

export function isAnyGscConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GSC_CLIENT_ID && env.GSC_CLIENT_SECRET);
}
