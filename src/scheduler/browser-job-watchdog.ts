import { logger } from "../config/logger.js";
import { runSessionCleanup } from "../sessions/session-cleanup.js";
import { withDeadline } from "../utils/deadline.js";

/** Hard limits per job kind; a frozen Camoufox otherwise holds the browser lock forever. */
export const BROWSER_JOB_LIMIT_MS = {
  session: 25 * 60_000,
  warmup: 25 * 60_000,
  snapshot: 30 * 60_000,
  grid: 75 * 60_000,
} as const;

/** After the browser is closed, the hung call throws and the job records its own failure within this. */
const SETTLE_AFTER_CLEANUP_MS = 2 * 60_000;

/**
 * Past the limit, close the job's registered browser so its pending Playwright call fails
 * and the job's own error handling runs. If it still doesn't finish, give up on it so the
 * lock is released either way.
 */
export async function runWithWatchdog<T>(fn: () => Promise<T>, limitMs: number, label: string): Promise<T> {
  const running = fn();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), limitMs);
  });
  try {
    const outcome = await Promise.race([running.then((value) => ({ value })), timedOut]);
    if (outcome !== "timeout") return outcome.value;
  } finally {
    clearTimeout(timer);
  }

  logger.error({ event: "browser_job_timeout", label, limitMinutes: Math.round(limitMs / 60_000) });
  await runSessionCleanup().catch((error: unknown) => {
    logger.error({ event: "browser_job_timeout_cleanup_failed", label, error: String(error) });
  });
  return withDeadline(running, SETTLE_AFTER_CLEANUP_MS, `${label} after browser close`);
}
