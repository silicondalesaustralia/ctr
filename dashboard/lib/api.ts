import { getStoredPassword } from "./auth";
import { buildApiUrl, resolveApiBaseUrl } from "./api-base";
import { resolveRailwayOrigin } from "./api-origin";
import { fetchRailwayHealth, preflightUnavailableMessage } from "./railway-health";

function resolveApiKey(): string {
  const stored = getStoredPassword()?.trim();
  if (stored) {
    return stored;
  }

  return (
    process.env.DASHBOARD_PASSWORD ??
    process.env.API_KEY ??
    process.env.NEXT_PUBLIC_API_KEY ??
    "dev-admin-key"
  ).trim();
}

export function getApiConfig() {
  const apiKey = resolveApiKey();
  return {
    apiUrl: resolveApiBaseUrl(),
    apiKeyConfigured: Boolean(apiKey && apiKey !== "dev-admin-key"),
  };
}

const LONG_RUNNING_PATHS = ["/campaign/preflight"];

function resolveFetchUrl(path: string): string {
  if (typeof window === "undefined") {
    return buildApiUrl(path);
  }

  const railwayOrigin = resolveRailwayOrigin();
  if (railwayOrigin && LONG_RUNNING_PATHS.some((prefix) => path.startsWith(prefix))) {
    return `${railwayOrigin}${path.startsWith("/") ? path : `/${path}`}`;
  }

  return buildApiUrl(path);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveFetchUrl(path);
  const response = await fetch(url, {
    ...init,
    headers: {
      "x-api-key": resolveApiKey(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (path.startsWith("/campaign/preflight") && response.status === 404) {
      const health = await fetchRailwayHealth(resolveRailwayOrigin() ?? undefined);
      throw new Error(preflightUnavailableMessage(health));
    }
    throw new Error(payload?.error ?? `API error ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export async function safeApiGet<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await apiGet<T>(path);
    return { data, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return { data: null, error: `${message} (API: ${buildApiUrl(path)})` };
  }
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, {
    method: "DELETE",
  });
}

export function getApiKey(): string {
  return resolveApiKey();
}
