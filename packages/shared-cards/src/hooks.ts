import { useEffect, useRef, useState } from "preact/hooks";

/** Call `fn` every `ms` milliseconds while the component is mounted. Always calls the latest `fn`. */
export function useInterval(fn: () => void, ms: number): void {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    const id = setInterval(() => latest.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Re-render every `ms` milliseconds, e.g. to keep "5 min ago" current. Returns the current time. */
export function useNow(ms: number): number {
  const [, setTick] = useState(0);
  useInterval(() => setTick((n) => n + 1), ms);
  return Date.now();
}

/**
 * The `value` for an input marked `data-k={key}`: `undefined` (leave it alone) while the user is
 * in that input, or when there's no value yet. Otherwise the value as a string.
 * Stops incoming state from jumping an input back while someone is typing or dragging.
 *
 * `<input data-k="vol" value={heldValue(host.shadowRoot, "vol", volume)} />`
 */
export function heldValue(
  root: DocumentOrShadowRoot | null,
  key: string,
  value: unknown,
): string | undefined {
  const focused = root?.activeElement as HTMLElement | null | undefined;
  if (value == null || focused?.dataset?.k === key) {
    return undefined;
  }
  return String(value);
}
