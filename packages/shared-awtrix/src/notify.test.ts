import { beforeEach, describe, expect, it } from "vitest";

import { buildNotify, loadRecent, saveRecent } from "./notify.ts";

describe("buildNotify", () => {
  it("builds a plain coloured message", () => {
    expect(buildNotify({ text: "Hi", color: "#00FF00", rainbow: false, dur: 10000 })).toEqual({
      text: "Hi",
      textColor: "#00FF00",
      durationMs: 10000,
    });
  });

  it("adds rainbow, icon, hold, effect and chime", () => {
    expect(
      buildNotify({
        text: "Hi",
        color: "#FFFFFF",
        rainbow: true,
        icon: "1234",
        dur: -1,
        effect: "Matrix",
        sound: true,
      }),
    ).toEqual({
      text: "Hi",
      textColor: "palette",
      palette: "Rainbow",
      paletteSpeed: 0.5,
      icon: "1234",
      hold: true,
      effect: "Matrix",
      sound: "ding",
    });
  });
});

describe("recent messages", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the newest first, without duplicates, up to the limit", () => {
    saveRecent("k", { text: "a" }, 2);
    saveRecent("k", { text: "b" }, 2);
    saveRecent("k", { text: "a" }, 2);
    expect(saveRecent("k", { text: "c" }, 2)).toEqual([{ text: "c" }, { text: "a" }]);
    expect(loadRecent("k")).toEqual([{ text: "c" }, { text: "a" }]);
  });
});
