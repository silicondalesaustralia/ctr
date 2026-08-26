import { getStoredPassword } from "./auth";

function resolveApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001"
  );
}

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
    apiUrl: resolveApiUrl(),
    apiKeyConfigured: Boolean(apiKey && apiKey !== "dev-admin-key"),
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${resolveApiUrl()}${path}`, {
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
    throw new Error(payload?.error ?? `API error ${response.status} for ${path}`);
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
    return { data: null, error: `${message} (API: ${resolveApiUrl()})` };
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

export function getApiKey(): string {
  return resolveApiKey();
}
