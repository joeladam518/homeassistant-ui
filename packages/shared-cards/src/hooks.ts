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
 * The value an input should show: `value`, unless the user is typing in it or dragging it.
 * Then it keeps what the user has entered, so a state update doesn't jump it back.
 *
 * `const ref = useRef<HTMLInputElement>(null)` → `<input ref={ref} value={heldValue(ref.current, v)} />`
 */
export function heldValue(el: HTMLInputElement | HTMLTextAreaElement | null, value: unknown): string {
  const root = el?.getRootNode() as Document | ShadowRoot | undefined;
  if (el && root?.activeElement === el) {
    return el.value;
  }
  return value == null ? "" : String(value);
}
