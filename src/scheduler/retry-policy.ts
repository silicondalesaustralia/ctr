import type { SessionStatus } from "@prisma/client";

export interface RetryPolicy {
  maxAttempts: number;
  delayMinutes: number;
}

/** Keep retrying infra failures every 5 minutes until the session succeeds. */
const UNTIL_SUCCESS: RetryPolicy = { maxAttempts: 10_000, delayMinutes: 5 };

export const RETRY_POLICIES: Record<string, RetryPolicy> = {
  proxy_error: UNTIL_SUCCESS,
  browser_error: UNTIL_SUCCESS,
  gologin_parallel_limit: UNTIL_SUCCESS,
  target_error: UNTIL_SUCCESS,
  google_error: UNTIL_SUCCESS,
  /** Intentional run outcomes — do not retry. */
  blocked: { maxAttempts: 0, delayMinutes: 0 },
  target_not_found: { maxAttempts: 0, delayMinutes: 0 },
  search_abandoned: { maxAttempts: 0, delayMinutes: 0 },
  target_found_no_click: { maxAttempts: 0, delayMinutes: 0 },
  completed: { maxAttempts: 0, delayMinutes: 0 },
};

export function isGoLoginParallelLimitError(message: string): boolean {
  return (
    /max parallel cloud launches/i.test(message) ||
    (/GoLogin API error 403/i.test(message) && /parallel/i.test(message)) ||
    /GoLogin cloud slot busy/i.test(message)
  );
}

export function isProxyTunnelError(message: string): boolean {
  return (
    /ERR_TUNNEL_CONNECTION_FAILED/i.test(message) ||
    /ERR_PROXY_CONNECTION_FAILED/i.test(message) ||
    /ERR_SOCKS_CONNECTION_FAILED/i.test(message) ||
    /tunnel connection failed/i.test(message) ||
    /Proxy egress geo lookup failed/i.test(message) ||
    /^fetch failed$/i.test(message.trim()) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(message)
  );
}

export function isWrongEgressGeoError(message: string): boolean {
  return /Proxy egress geo mismatch/i.test(message);
}

export function classifyBrowserErrorCode(message: string): string {
  if (isGoLoginParallelLimitError(message)) {
    return "gologin_parallel_limit";
  }
  if (isProxyTunnelError(message) || isWrongEgressGeoError(message)) {
    return "proxy_error";
  }
  return "browser_error";
}

export function shouldRetry(statusOrCode: string, attemptCount: number): boolean {
  const policy = RETRY_POLICIES[statusOrCode];
  if (!policy) return false;
  return attemptCount < policy.maxAttempts;
}

export function getRetryDelayMinutes(statusOrCode: string): number {
  return RETRY_POLICIES[statusOrCode]?.delayMinutes ?? 0;
}

export function mapErrorStatus(errorCode: string): SessionStatus {
  if (errorCode === "proxy_error" || errorCode === "target_error" || errorCode === "browser_error") {
    return errorCode;
  }
  return "browser_error";
}
