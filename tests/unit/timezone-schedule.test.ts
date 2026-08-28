import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  getCalendarDateInTimezone,
  localHourMinute,
  randomTimeInTimezoneWindow,
  zonedLocalTimeToUtc,
} from "../../src/utils/helpers.js";

describe("timezone scheduling", () => {
  it("converts Adelaide wall clock to the same local hour", () => {
    const instant = zonedLocalTimeToUtc(
      { year: 2026, month: 8, day: 28 },
      19,
      30,
      0,
      "Australia/Adelaide",
    );

    expect(localHourMinute(instant, "Australia/Adelaide")).toEqual({ hour: 19, minute: 30 });
  });

  it("advances calendar days independent of UTC boundaries", () => {
    expect(addCalendarDays({ year: 2026, month: 8, day: 28 }, 2)).toEqual({
      year: 2026,
      month: 8,
      day: 30,
    });
  });

  it("derives calendar dates in the campaign timezone", () => {
    const instant = new Date("2026-08-27T14:00:00.000Z");
    expect(getCalendarDateInTimezone(instant, "Australia/Adelaide")).toEqual({
      year: 2026,
      month: 8,
      day: 27,
    });
  });

  it("keeps random campaign times inside the configured local window", () => {
    for (let i = 0; i < 25; i += 1) {
      const instant = randomTimeInTimezoneWindow(
        { year: 2026, month: 8, day: 28 },
        "06:30",
        "23:00",
        "Australia/Adelaide",
      );
      const { hour, minute } = localHourMinute(instant, "Australia/Adelaide");
      const totalMinutes = hour * 60 + minute;
      expect(totalMinutes).toBeGreaterThanOrEqual(6 * 60 + 30);
      expect(totalMinutes).toBeLessThanOrEqual(23 * 60);
    }
  });
});
