import { lsGet, lsSet } from "@joeladam518/shared-cards/storage.ts";

export const DURATIONS = [
  { label: "5 s", ms: 5000 },
  { label: "10 s", ms: 10000 },
  { label: "30 s", ms: 30000 },
  { label: "1 min", ms: 60000 },
  { label: "Until dismissed", ms: -1 },
] as const;

/** The duration picked when the card opens (10 s). */
export const DEFAULT_DURATION_MS = 10000;

export interface NotifyOptions {
  text: string;
  /** "#RRGGBB" */
  color: string;
  rainbow: boolean;
  icon?: string;
  /** How long it shows, in ms; negative = until dismissed. */
  dur: number;
  /** Background effect name. */
  effect?: string;
  /** Play a chime. */
  sound?: boolean;
}

/** The JSON body for `<prefix>/cmd/notify`. */
export function buildNotify({
  text,
  color,
  rainbow,
  icon,
  dur,
  effect,
  sound,
}: NotifyOptions): Record<string, unknown> {
  const body: Record<string, unknown> = { text };
  if (rainbow) Object.assign(body, { textColor: "palette", palette: "Rainbow", paletteSpeed: 0.5 });
  else body.textColor = color;
  if (icon) body.icon = String(icon);
  if (dur < 0) body.hold = true;
  else body.durationMs = dur;
  if (effect) body.effect = effect;
  if (sound) body.sound = "ding";
  return body;
}

export interface RecentMessage {
  text: string;
  color?: string;
  icon?: string;
  rainbow?: boolean;
}

/** Recently sent messages, newest first, kept in localStorage under `key`. */
export const loadRecent = (key: string): RecentMessage[] => lsGet<RecentMessage[]>(key, []);

/** Puts a message at the front of the recent list (no duplicates) and keeps the newest `max`. */
export function saveRecent(key: string, msg: RecentMessage, max: number): RecentMessage[] {
  const list = loadRecent(key).filter((r) => r.text !== msg.text || r.icon !== msg.icon);
  list.unshift(msg);
  const kept = list.slice(0, max);
  lsSet(key, kept);
  return kept;
}
