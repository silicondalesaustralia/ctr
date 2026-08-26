function resolveApiUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3001"
  );
}

function resolveApiKey(): string {
  return (
    process.env.API_KEY ??
    process.env.NEXT_PUBLIC_API_KEY ??
    "dev-admin-key"
  );
}

export function getApiConfig() {
  const apiKey = resolveApiKey();
  return {
    apiUrl: resolveApiUrl(),
    apiKeyConfigured: Boolean(apiKey && apiKey !== "dev-admin-key"),
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    headers: { "x-api-key": resolveApiKey() },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status} for ${path}`);
  }
  return response.json() as Promise<T>;
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
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": resolveApiKey(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${resolveApiUrl()}${path}`, {
    method: "PUT",
    headers: {
      "x-api-key": resolveApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function apiExportUrl(path: string): string {
  return `${resolveApiUrl()}${path}`;
}

export function getApiKey(): string {
  return resolveApiKey();
}

/** @deprecated Prefer getApiKey() so client bundles pick up build-time env correctly. */
export const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? "dev-admin-key";
