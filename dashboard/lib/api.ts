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

const API_URL = resolveApiUrl();
const API_KEY = resolveApiKey();

export function getApiConfig() {
  return { apiUrl: API_URL, apiKeyConfigured: Boolean(API_KEY && API_KEY !== "dev-admin-key") };
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "x-api-key": API_KEY },
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
    return { data: null, error: `${message} (API: ${API_URL})` };
  }
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
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
  const response = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: {
      "x-api-key": API_KEY,
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
  return `${API_URL}${path}`;
}

export const apiKey = API_KEY;
