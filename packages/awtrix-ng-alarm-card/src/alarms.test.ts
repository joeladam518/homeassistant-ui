import { describe, expect, it } from "vitest";

import {
  daysSummary,
  formatAlarmTime,
  nextAlarm,
  parseAlarms,
  serializeAlarms,
  toggleDay,
} from "./alarms.ts";

describe("parseAlarms / serializeAlarms", () => {
  it("reads the stored list, skipping broken items", () => {
    expect(parseAlarms("0730:12345:1, 0900:76:0,bad,1200::1")).toEqual([
      { t: "0730", d: "12345", on: true },
      { t: "0900", d: "67", on: false },
      { t: "1200", d: "", on: true },
    ]);
    expect(parseAlarms(undefined)).toEqual([]);
  });

  it("writes the list sorted by time", () => {
    expect(
      serializeAlarms([
        { t: "0900", d: "67", on: false },
        { t: "0730", d: "12345", on: true },
      ]),
    ).toBe("0730:12345:1,0900:67:0");
  });
});

describe("daysSummary", () => {
  it.each([
    ["1234567", "Every day"],
    ["12345", "Weekdays"],
    ["67", "Weekends"],
    ["135", "Mo, We, Fr"],
  ])("%s → %s", (d, text) => {
    expect(daysSummary(d)).toBe(text);
  });
});

it("toggleDay keeps the days sorted", () => {
  expect(toggleDay("135", "2")).toBe("1235");
  expect(toggleDay("135", "3")).toBe("15");
});

it("formatAlarmTime in 24- and 12-hour time", () => {
  expect(formatAlarmTime("0730", false)).toEqual({ time: "07:30" });
  expect(formatAlarmTime("0730", true)).toEqual({ time: "7:30", ampm: "AM" });
  expect(formatAlarmTime("0000", true)).toEqual({ time: "12:00", ampm: "AM" });
  expect(formatAlarmTime("1815", true)).toEqual({ time: "6:15", ampm: "PM" });
});

describe("nextAlarm", () => {
  // Wednesday 14 Jan 2026, 08:00 local time
  const now = new Date(2026, 0, 14, 8, 0);

  it("finds a later alarm today", () => {
    const next = nextAlarm(parseAlarms("0730:3:1,0900:3:1"), now);
    expect(next?.alarm.t).toBe("0900");
    expect(next?.daysAhead).toBe(0);
  });

  it("looks ahead to the next matching day and skips switched-off alarms", () => {
    const next = nextAlarm(parseAlarms("0700:3:0,0630:6:1"), now);
    expect(next?.alarm.t).toBe("0630");
    expect(next?.daysAhead).toBe(3); // Saturday
  });

  it("finds today's earlier alarm next week", () => {
    expect(nextAlarm(parseAlarms("0700:3:1"), now)?.daysAhead).toBe(7);
  });

  it("is null with nothing enabled", () => {
    expect(nextAlarm(parseAlarms("0700:3:0"), now)).toBeNull();
  });
});
