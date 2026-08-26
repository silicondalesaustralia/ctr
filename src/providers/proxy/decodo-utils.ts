import type { ProxyAllocationRequest } from "./ProxyProvider.js";

export interface DecodoEndpoint {
  host: string;
  port: number;
  baseUsername: string;
  password: string;
}

export function buildDecodoUsername(
  baseUsername: string,
  input: ProxyAllocationRequest,
  sessionDurationMinutes = 30,
): string {
  const user = baseUsername.replace(/^user-/, "");
  const country = input.country.toLowerCase();
  const city = input.city?.toLowerCase().replace(/\s+/g, "_");
  const sessionKey = (input.sessionKey ?? "session").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);

  const parts = [`user-${user}`, `country-${country}`];
  if (city) {
    parts.push(`city-${city}`);
  }
  parts.push(`session-${sessionKey}`, `sessionduration-${sessionDurationMinutes}`);
  return parts.join("-");
}
