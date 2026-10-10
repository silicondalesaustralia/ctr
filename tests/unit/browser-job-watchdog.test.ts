import { afterEach, describe, expect, it, vi } from "vitest";

const cleanup = vi.fn<() => Promise<void>>();
vi.mock("../../src/sessions/session-cleanup.js", () => ({ runSessionCleanup: () => cleanup() }));
vi.mock("../../src/config/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { runWithWatchdog } = await import("../../src/scheduler/browser-job-watchdog.js");

afterEach(() => {
  vi.useRealTimers();
  cleanup.mockReset();
});

describe("runWithWatchdog", () => {
  it("returns the job's result when it finishes in time", async () => {
    await expect(runWithWatchdog(async () => 42, 1_000, "job")).resolves.toBe(42);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("closes the browser past the limit so the hung call fails and the job ends", async () => {
    vi.useFakeTimers();
    let rejectHung: (error: Error) => void = () => undefined;
    cleanup.mockImplementation(async () => rejectHung(new Error("Target closed")));
    const job = runWithWatchdog(
      () => new Promise<never>((_, reject) => { rejectHung = reject; }),
      1_000,
      "job",
    );
    const settled = expect(job).rejects.toThrow("Target closed");
    await vi.advanceTimersByTimeAsync(1_001);
    await settled;
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("gives up on a job that still hangs after the browser is closed", async () => {
    vi.useFakeTimers();
    cleanup.mockResolvedValue(undefined);
    const job = runWithWatchdog(() => new Promise<never>(() => undefined), 1_000, "job");
    const settled = expect(job).rejects.toThrow(/did not finish/);
    await vi.advanceTimersByTimeAsync(1_001 + 2 * 60_000 + 1);
    await settled;
  });
});
