import { describe, expect, it } from "vitest";
import { withBrowserJobExclusive } from "../../src/scheduler/browser-job-mutex.js";

describe("withBrowserJobExclusive", () => {
  it("runs jobs one at a time and lets priority jobs jump queued ones", async () => {
    const order: string[] = [];
    let running = 0;
    let releaseFirst!: () => void;
    const job = (name: string, wait?: Promise<void>) => async () => {
      running += 1;
      expect(running).toBe(1);
      order.push(name);
      if (wait) await wait;
      running -= 1;
    };

    const first = withBrowserJobExclusive(job("session", new Promise((resolve) => (releaseFirst = resolve))));
    const warmup = withBrowserJobExclusive(job("warmup"));
    const preflight = withBrowserJobExclusive(job("preflight"), { priority: true });
    releaseFirst();
    await Promise.all([first, warmup, preflight]);

    expect(order).toEqual(["session", "preflight", "warmup"]);
  });

  it("releases the lock when a job throws", async () => {
    await expect(withBrowserJobExclusive(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(withBrowserJobExclusive(async () => "ok")).resolves.toBe("ok");
  });
});
