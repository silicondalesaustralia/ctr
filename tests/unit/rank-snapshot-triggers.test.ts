import { describe, expect, it } from "vitest";
import { dailyDueMinute, localDateString } from "../../src/rank-snapshots/snapshot-triggers.js";

describe("rank snapshot triggers", () => {
  it("is due 30 minutes after the schedule window ends", () => {
    expect(dailyDueMinute("23:00")).toBe(23 * 60 + 30);
    expect(dailyDueMinute("20:15")).toBe(20 * 60 + 45);
  });

  it("never pushes the daily snapshot past the local day", () => {
    expect(dailyDueMinute("23:45")).toBe(23 * 60 + 55);
  });

  it("uses the campaign timezone's calendar date", () => {
    const instant = new Date("2026-10-01T14:00:00Z");
    expect(localDateString(instant, "Australia/Adelaide")).toBe("2026-10-01");
    expect(localDateString(new Date("2026-10-01T15:00:00Z"), "Australia/Adelaide")).toBe("2026-10-02");
  });
});
