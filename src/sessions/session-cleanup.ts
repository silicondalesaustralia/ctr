import type { Browser } from "playwright";
import { prisma } from "../db/client.js";
import type {
  BrowserProfileProvider,
  RunningBrowser,
} from "../providers/browser/BrowserProfileProvider.js";
import type { ProxyProvider } from "../providers/proxy/ProxyProvider.js";

type CleanupFn = () => Promise<void>;

let activeCleanup: CleanupFn | null = null;
let handlersInstalled = false;

export function registerSessionCleanup(cleanup: CleanupFn): void {
  activeCleanup = cleanup;
  installSignalHandlers();
}

export function clearSessionCleanup(): void {
  activeCleanup = null;
}

export async function runSessionCleanup(): Promise<void> {
  const fn = activeCleanup;
  activeCleanup = null;
  if (fn) {
    await fn();
  }
}

function installSignalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  const onSignal = (signal: "SIGINT" | "SIGTERM") => {
    console.error(`[session] Received ${signal}, cleaning up browser session...`);
    void runSessionCleanup().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };

  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));
}

export interface BrowserCleanupRefs {
  connectedBrowser: Browser | null;
  runningBrowser: RunningBrowser | null;
  profileId: string | null;
  cloudStarted: boolean;
  useGoLogin: boolean;
  browserProvider: BrowserProfileProvider;
  proxyLeaseId: string | null;
  proxyProvider: ProxyProvider;
}

export async function cleanupBrowserSession(refs: BrowserCleanupRefs): Promise<void> {
  if (refs.connectedBrowser) {
    console.error("[session] Closing Playwright connection...");
    await refs.connectedBrowser.close().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[session] Playwright close failed: ${message}`);
    });
  }

  if (!refs.profileId) {
    return;
  }

  if (refs.useGoLogin && refs.runningBrowser) {
    await refs.browserProvider.stopProfile(refs.profileId, refs.runningBrowser);
  } else if (refs.useGoLogin && refs.cloudStarted) {
    await refs.browserProvider.stopProfile(refs.profileId, undefined);
  } else if (refs.runningBrowser?.context) {
    await refs.browserProvider.stopProfile(refs.profileId, refs.runningBrowser);
  }

  if (refs.proxyLeaseId) {
    await refs.proxyProvider.release(refs.proxyLeaseId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[session] Proxy release failed: ${message}`);
    });
  }
}

const STALE_SESSION_MINUTES = 30;
const STALE_SCHEDULED_MINUTES = 60;

export async function cleanupStaleRunningSessions(
  maxAgeMinutes = STALE_SESSION_MINUTES,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const result = await prisma.session.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "browser_error",
      endedAt: new Date(),
      errorCode: "orphaned",
      errorMessage: "Session marked stale after process interruption",
    },
  });
  if (result.count > 0) {
    console.error(`[session] Marked ${result.count} stale running session(s) as browser_error`);
  }
  return result.count;
}

export async function cleanupStaleScheduledSessions(
  maxAgeMinutes = STALE_SCHEDULED_MINUTES,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const stuck = await prisma.scheduledSession.findMany({
    where: { status: "running" },
    include: {
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  let count = 0;
  for (const item of stuck) {
    const latest = item.sessions[0];
    if (!latest) {
      await prisma.scheduledSession.update({
        where: { id: item.id },
        data: { status: "scheduled" },
      });
      count += 1;
      continue;
    }

    if (latest.status === "running" && latest.startedAt && latest.startedAt >= cutoff) {
      continue;
    }

    await prisma.scheduledSession.update({
      where: { id: item.id },
      data: { status: latest.status === "completed" ? "completed" : "scheduled" },
    });
    count += 1;
  }

  if (count > 0) {
    console.error(`[session] Reset ${count} stale scheduled session(s)`);
  }
  return count;
}

/**
 * Warmup rows stay `running` with no sessionId until the job finishes.
 * After campaign/warmup Session orphans are cleared, re-queue stranded warmups.
 */
export async function cleanupStaleWarmupSessions(): Promise<number> {
  const runningWarmups = await prisma.warmupSession.findMany({
    where: { status: "running" },
  });

  let count = 0;
  for (const warmup of runningWarmups) {
    const activeSession = await prisma.session.findFirst({
      where: { identityId: warmup.identityId, status: "running" },
      select: { id: true },
    });
    if (activeSession) continue;

    await prisma.warmupSession.update({
      where: { id: warmup.id },
      data: {
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    count += 1;
  }

  if (count > 0) {
    console.error(`[session] Re-queued ${count} stale warmup session(s)`);
  }
  return count;
}

export async function cleanupStaleSessions(): Promise<void> {
  await cleanupStaleRunningSessions();
  await cleanupStaleScheduledSessions();
  await cleanupStaleWarmupSessions();
}
