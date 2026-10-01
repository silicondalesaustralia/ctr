import { describe, expect, it } from "vitest";
import { randomDayTimes } from "../../src/scheduler/day-slots.js";
import { localHourMinute } from "../../src/utils/helpers.js";

const DAY = { year: 2026, month: 10, day: 2 };
const TZ = "Australia/Adelaide";

function localMinutes(at: Date): number {
  const { hour, minute } = localHourMinute(at, TZ);
  return hour * 60 + minute;
}

describe("randomDayTimes", () => {
  it("keeps every time inside the local window, in order, at least the gap apart", () => {
    for (let run = 0; run < 200; run += 1) {
      const times = randomDayTimes(DAY, 6, "06:30", "23:00", TZ, 120);
      expect(times).toHaveLength(6);
      for (const [index, at] of times.entries()) {
        expect(localMinutes(at)).toBeGreaterThanOrEqual(6 * 60 + 30);
        expect(localMinutes(at)).toBeLessThanOrEqual(23 * 60);
        if (index > 0) {
          expect(at.getTime() - times[index - 1]!.getTime()).toBeGreaterThanOrEqual(120 * 60_000 - 1);
        }
      }
    }
  });

  it("returns only as many times as fit in the window", () => {
    expect(randomDayTimes(DAY, 20, "06:30", "23:00", TZ, 120)).toHaveLength(9);
  });
});
