import { hsToRgb } from "./color.ts";

/** Paints a hue (angle) × saturation (radius) colour wheel, with a soft edge. */
export function drawWheel(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const size = canvas.width;
  const radius = size / 2;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - radius + 0.5;
      const dy = y - radius + 0.5;
      const d = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      if (d > radius) {
        continue;
      } // stays transparent
      let h = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (h < 0) {
        h += 360;
      }
      const [r, g, b] = hsToRgb(h, (d / radius) * 100);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = d > radius - 1.5 ? Math.round((255 * (radius - d)) / 1.5) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Hue and saturation under a pointer on the wheel element (outside the wheel clamps to the edge). */
export function pointerHs(ev: PointerEvent, wheel: HTMLElement): [number, number] {
  const r = wheel.getBoundingClientRect();
  const x = ev.clientX - r.left - r.width / 2;
  const y = ev.clientY - r.top - r.height / 2;
  const dist = Math.min(1, Math.hypot(x, y) / (r.width / 2));
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) {
    h += 360;
  }
  return [h, dist * 100];
}

/** The marker's position (in % of the wheel) for a hue and saturation. */
export function markerPosition(h: number, s: number): { left: string; top: string } {
  const a = (h * Math.PI) / 180;
  const r = (s / 100) * 50;
  return { left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` };
}
