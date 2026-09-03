import { describe, expect, it } from "vitest";
import { withBrowserJobExclusive } from "../../src/scheduler/browser-job-mutex.js";

describe("browser-job-mutex", () => {
  it("runs jobs strictly one at a time", async () => {
    const order: string[] = [];
    const slow = withBrowserJobExclusive(async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 40));
      order.push("a-end");
      return 1;
    });
    const fast = withBrowserJobExclusive(async () => {
      order.push("b-start");
      order.push("b-end");
      return 2;
    });

    const [a, b] = await Promise.all([slow, fast]);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });
});
