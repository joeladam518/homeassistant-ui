import { afterEach, describe, expect, it, vi } from "vitest";

import { batteryIcon, relTime } from "./format.ts";

afterEach(() => {
  vi.useRealTimers();
});

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("relTime", () => {
  it("short style", () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T12:00:00Z") });
    expect(relTime(ago(30_000))).toBe("just now");
    expect(relTime(ago(5 * 60_000))).toBe("5m ago");
    expect(relTime(ago(3 * 3600_000))).toBe("3h ago");
    expect(relTime(ago(50 * 3600_000))).toBe("2d ago");
  });

  it("spaced style", () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T12:00:00Z") });
    expect(relTime(ago(20_000), "spaced")).toBe("just now");
    expect(relTime(ago(5 * 60_000), "spaced")).toBe("5 min ago");
    expect(relTime(ago(3 * 3600_000), "spaced")).toBe("3 h ago");
    expect(relTime(ago(50 * 3600_000), "spaced")).toBe("2 d ago");
  });

  it("is empty without a time", () => {
    expect(relTime(undefined)).toBe("");
  });
});

describe("batteryIcon", () => {
  it.each([
    [null, {}, "mdi:battery-unknown"],
    [100, {}, "mdi:battery"],
    [64, {}, "mdi:battery-60"],
    [2, {}, "mdi:battery-10"],
    [4, { alertAt: 5 }, "mdi:battery-alert-variant-outline"],
    [96, { charging: true }, "mdi:battery-charging-100"],
    [33, { charging: true }, "mdi:battery-charging-30"],
  ])("%s %o → %s", (pct, opts, icon) => {
    expect(batteryIcon(pct, opts)).toBe(icon);
  });
});
