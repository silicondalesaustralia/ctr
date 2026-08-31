import type { SessionStatus } from "@prisma/client";

export interface RetryPolicy {
  maxAttempts: number;
  delayMinutes: number;
}

export const RETRY_POLICIES: Record<string, RetryPolicy> = {
  proxy_error: { maxAttempts: 2, delayMinutes: 60 },
  browser_error: { maxAttempts: 2, delayMinutes: 60 },
  /** GoLogin cloud slot busy — retry quickly until a slot frees. */
  gologin_parallel_limit: { maxAttempts: 24, delayMinutes: 5 },
  target_error: { maxAttempts: 1, delayMinutes: 60 },
  blocked: { maxAttempts: 0, delayMinutes: 0 },
  target_not_found: { maxAttempts: 0, delayMinutes: 0 },
  search_abandoned: { maxAttempts: 0, delayMinutes: 0 },
  target_found_no_click: { maxAttempts: 0, delayMinutes: 0 },
  google_error: { maxAttempts: 0, delayMinutes: 0 },
};

export function isGoLoginParallelLimitError(message: string): boolean {
  return (
    /max parallel cloud launches/i.test(message) ||
    (/GoLogin API error 403/i.test(message) && /parallel/i.test(message))
  );
}

export function classifyBrowserErrorCode(message: string): string {
  if (isGoLoginParallelLimitError(message)) {
    return "gologin_parallel_limit";
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
