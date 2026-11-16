export interface Point {
  t: number;
  v: number;
}

/** Maps a time to an x position, `width` wide, over the window [t0, t1]. Earlier times clamp to 0. */
export const timeScale =
  (t0: number, t1: number, width: number) =>
  (t: number): number =>
    ((Math.max(t0, t) - t0) / (t1 - t0)) * width;

/** An SVG path `d` through the points. */
export function linePath(points: Point[], x: (t: number) => number, y: (v: number) => number): string {
  return points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
}

/** Closes a line path down to `bottom`, for a filled area under the line. */
export function areaPath(line: string, points: Point[], x: (t: number) => number, bottom: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!line || !first || !last) {
    return "";
  }
  return `${line}L${x(last.t).toFixed(1)},${bottom}L${x(first.t).toFixed(1)},${bottom}Z`;
}
