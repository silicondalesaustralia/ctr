import { buildApiUrl } from "./api-base";

const AUTH_KEY = "ctr_session";

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(sessionStorage.getItem(AUTH_KEY) ?? sessionStorage.getItem("ctr_api_key"));
}

export function getStoredPassword(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(AUTH_KEY) ?? sessionStorage.getItem("ctr_api_key");
}

export function setStoredPassword(password: string): void {
  sessionStorage.setItem(AUTH_KEY, password);
  sessionStorage.removeItem("ctr_api_key");
}

export function clearStoredPassword(): void {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem("ctr_api_key");
}

/** @deprecated use getStoredPassword */
export function getStoredApiKey(): string | null {
  return getStoredPassword();
}

/** @deprecated use setStoredPassword */
export function setStoredApiKey(password: string): void {
  setStoredPassword(password);
}

/** @deprecated use clearStoredPassword */
export function clearStoredApiKey(): void {
  clearStoredPassword();
}

export async function verifyLogin(password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error("Password is required");
  }

  const apiUrl = buildApiUrl("/auth/verify");
  let response: Response;

  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: trimmed }),
    });
  } catch {
    throw new Error(
      `Cannot reach API at ${apiUrl}. Start it with: npm run api`,
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const detail = payload?.error ?? "Incorrect password";
    throw new Error(detail);
  }

  setStoredPassword(trimmed);
}

export async function verifyStoredPassword(): Promise<boolean> {
  const stored = getStoredPassword()?.trim();
  if (!stored) {
    return false;
  }

  const apiUrl = buildApiUrl("/auth/verify");

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: stored }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** @deprecated use verifyStoredPassword */
export async function verifyStoredApiKey(): Promise<boolean> {
  return verifyStoredPassword();
}
