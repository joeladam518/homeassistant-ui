// Shared helper — the same file is copied into each homeassistant-* card repo. Keep the copies identical.

/** Read JSON from localStorage, or `fallback` if it's missing, broken or storage is blocked. */
export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage; does nothing if storage is blocked. */
export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota): the card still works, it just doesn't remember
  }
}
