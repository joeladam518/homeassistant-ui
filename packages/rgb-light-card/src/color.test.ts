import { describe, expect, it } from "vitest";

import { DEFAULT_FAVORITES, favoriteMatches, hexToRgb, hsToRgb, rgbToHs } from "./color.ts";

const fav = (name: string) => DEFAULT_FAVORITES.find((f) => f.name === name)!;

describe("colour maths", () => {
  it("reads hex colours", () => {
    expect(hexToRgb("#FF7A00")).toEqual([255, 122, 0]);
    expect(hexToRgb("nope")).toBeNull();
  });

  it("round-trips hue / saturation", () => {
    expect(hsToRgb(0, 100)).toEqual([255, 0, 0]);
    expect(hsToRgb(240, 100)).toEqual([0, 0, 255]);
    expect(hsToRgb(0, 0)).toEqual([255, 255, 255]);
    const [h, s] = rgbToHs([0, 255, 255]);
    expect(h).toBeCloseTo(180);
    expect(s).toBeCloseTo(100);
  });
});

describe("favoriteMatches", () => {
  it("matches a close colour, not a different one", () => {
    expect(favoriteMatches(fav("Red"), [250, 4, 0])).toBe(true);
    expect(favoriteMatches(fav("Red"), [0, 0, 255])).toBe(false);
  });

  it("matches White only to the white LEDs", () => {
    expect(favoriteMatches(fav("White"), "white")).toBe(true);
    expect(favoriteMatches(fav("White"), [255, 255, 255])).toBe(false);
    expect(favoriteMatches(fav("Red"), "white")).toBe(false);
  });
});
