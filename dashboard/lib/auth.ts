const AUTH_KEY = "ctr_api_key";

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(sessionStorage.getItem(AUTH_KEY));
}

export function getStoredApiKey(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(AUTH_KEY);
}

export function setStoredApiKey(apiKey: string): void {
  sessionStorage.setItem(AUTH_KEY, apiKey);
}

export function clearStoredApiKey(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function resolveApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001"
  );
}

export async function verifyLogin(apiKey: string): Promise<void> {
  const response = await fetch(`${resolveApiUrl()}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Invalid access key");
  }

  setStoredApiKey(apiKey);
}
