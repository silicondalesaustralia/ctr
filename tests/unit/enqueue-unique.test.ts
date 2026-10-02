import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { addUniqueJob } from "../../src/scheduler/enqueue-unique.js";

function fakeQueue(state: string | null) {
  const remove = vi.fn(async () => undefined);
  const add = vi.fn(async () => undefined);
  const job = state ? { getState: async () => state, remove } : undefined;
  const queue = { getJob: async () => job, add } as unknown as Queue;
  return { queue, add, remove };
}

describe("addUniqueJob", () => {
  it("re-adds a row whose previous job failed", async () => {
    const { queue, add, remove } = fakeQueue("failed");
    await addUniqueJob(queue, "run-session", { scheduledSessionId: "s1" }, "s1");
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledWith("run-session", { scheduledSessionId: "s1" }, expect.objectContaining({ jobId: "s1" }));
  });

  it("leaves a waiting or running job alone", async () => {
    for (const state of ["waiting", "active", "delayed"]) {
      const { queue, add, remove } = fakeQueue(state);
      await addUniqueJob(queue, "run-session", { scheduledSessionId: "s1" }, "s1");
      expect(remove).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
    }
  });

  it("adds a new job when none exists", async () => {
    const { queue, add } = fakeQueue(null);
    await addUniqueJob(queue, "run-warmup", { warmupSessionId: "w1" }, "w1");
    expect(add).toHaveBeenCalledOnce();
  });
});
