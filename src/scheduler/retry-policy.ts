import type { SessionStatus } from "@prisma/client";

export interface RetryPolicy {
  maxAttempts: number;
  delayMinutes: number;
}

export const RETRY_POLICIES: Record<string, RetryPolicy> = {
  proxy_error: { maxAttempts: 2, delayMinutes: 60 },
  browser_error: { maxAttempts: 2, delayMinutes: 60 },
  target_error: { maxAttempts: 1, delayMinutes: 60 },
  blocked: { maxAttempts: 0, delayMinutes: 0 },
  target_not_found: { maxAttempts: 0, delayMinutes: 0 },
  search_abandoned: { maxAttempts: 0, delayMinutes: 0 },
  target_found_no_click: { maxAttempts: 0, delayMinutes: 0 },
  google_error: { maxAttempts: 0, delayMinutes: 0 },
};

export function shouldRetry(status: SessionStatus, attemptCount: number): boolean {
  const policy = RETRY_POLICIES[status];
  if (!policy) return false;
  return attemptCount < policy.maxAttempts;
}

export function getRetryDelayMinutes(status: SessionStatus): number {
  return RETRY_POLICIES[status]?.delayMinutes ?? 0;
}

export function mapErrorStatus(errorCode: string): SessionStatus {
  if (errorCode in RETRY_POLICIES) {
    return errorCode as SessionStatus;
  }
  return "browser_error";
}
