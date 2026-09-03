import { execSync } from "node:child_process";

/**
 * Railway OOM kills leave Orbita/Chrome children behind on restart.
 * Safe on the worker before any session starts (and after stop failures).
 */
export function killOrphanBrowserProcesses(reason: string): void {
  try {
    execSync(
      "pkill -9 -f '[Oo]rbita|[Cc]hrome|[Cc]hromium' 2>/dev/null || true",
      { stdio: "ignore", timeout: 5_000 },
    );
    console.error(`[browser] Cleared orphan browser processes (${reason})`);
  } catch {
    // pkill exits non-zero when nothing matched; ignore.
  }
}

export function logWorkerMemory(label: string): void {
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
  console.error(`[browser] memory ${label}: rss=${rssMb}MB heap=${heapMb}MB`);
}
