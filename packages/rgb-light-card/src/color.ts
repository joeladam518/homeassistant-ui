export type Rgb = [number, number, number];

export interface Favorite {
  name: string;
  /** What's sent to the light: "#RRGGBB", or "white" for the white LEDs on RGBW / RGBWW lights. */
  color: string;
  /**
   * Optional. What the card shows for it ("#RRGGBB"), for when the colour you send doesn't look
   * the same on screen as it does on the light. Defaults to `color`.
   */
  displayColor?: string;
}

export const DEFAULT_FAVORITES: Favorite[] = [
  { name: "Red", color: "#FF0000" },
  { name: "Orange", color: "#FF7A00" },
  { name: "Yellow", color: "#FFD600" },
  { name: "Green", color: "#00FF00" },
  { name: "Cyan", color: "#00FFFF" },
  { name: "Blue", color: "#0000FF" },
  { name: "Purple", color: "#8A00FF" },
  { name: "Magenta", color: "#FF00FF" },
  { name: "White", color: "white" },
];

export const isWhiteFavorite = (f: Favorite): boolean => String(f.color).toLowerCase() === "white";

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) {
    return null;
  }
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue 0–360 and saturation 0–100 → RGB at full brightness. */
export function hsToRgb(h: number, s: number): Rgb {
  const sat = s / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

/** RGB → [hue 0–360, saturation 0–100]. */
export function rgbToHs([r, g, b]: Rgb): [number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) {
    if (max === rr) {
      h = ((gg - bb) / d) % 6;
    } else if (max === gg) {
      h = (bb - rr) / d + 2;
    } else {
      h = (rr - gg) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return [h, max ? (d / max) * 100 : 0];
}

/** The `displayColor` of a favourite, if it has a valid one. */
export const favoriteDisplayRgb = (f: Favorite): Rgb | null =>
  f.displayColor ? hexToRgb(f.displayColor) : null;

/** The swatch colour for a favourite: its `displayColor`, else its `color`. */
export const favoriteRgb = (f: Favorite): Rgb =>
  favoriteDisplayRgb(f) ?? (isWhiteFavorite(f) ? [255, 255, 255] : (hexToRgb(f.color) ?? [255, 255, 255]));

/** Is the light showing this favourite? Colours match when hue and saturation are close. */
export function favoriteMatches(f: Favorite, current: Rgb | "white" | null): boolean {
  if (current === "white") {
    return isWhiteFavorite(f);
  }
  if (!current || isWhiteFavorite(f)) {
    return false;
  }
  const fav = hexToRgb(f.color);
  if (!fav) {
    return false;
  }
  const [h1, s1] = rgbToHs(fav);
  const [h2, s2] = rgbToHs(current);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return dh < 8 && Math.abs(s1 - s2) < 12;
}
