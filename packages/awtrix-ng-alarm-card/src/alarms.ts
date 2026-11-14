/**
 * Alarms live in one input_text as "HHMM:days:on" items, comma separated.
 * days = ISO weekday digits (1 = Monday … 7 = Sunday). Example: "0730:12345:1,0900:67:1"
 */
export interface Alarm {
  /** "HHMM" */
  t: string;
  /** Sorted ISO weekday digits, e.g. "12345". */
  d: string;
  on: boolean;
}

export const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const alarmKey = (a: Alarm): string => `${a.t}:${a.d}`;

export function parseAlarms(s: string | null | undefined): Alarm[] {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x): Alarm | null => {
      const [t = "", d = "", on = "1"] = x.split(":");
      if (!/^\d{4}$/.test(t)) return null;
      const days = [...new Set(d.split("").filter((c) => /[1-7]/.test(c)))].toSorted().join("");
      return { t, d: days, on: on !== "0" };
    })
    .filter((a): a is Alarm => a !== null);
}

export function serializeAlarms(list: Alarm[]): string {
  return list
    .toSorted((a, b) => a.t.localeCompare(b.t) || a.d.localeCompare(b.d))
    .map((a) => `${a.t}:${a.d}:${a.on ? 1 : 0}`)
    .join(",");
}

/** "Every day", "Weekdays", "Weekends" or "Mo, We, Fr". */
export function daysSummary(d: string): string {
  if (d === "1234567") return "Every day";
  if (d === "12345") return "Weekdays";
  if (d === "67") return "Weekends";
  return d
    .split("")
    .map((n) => DAY_LABELS[Number(n) - 1])
    .join(", ");
}

/** Toggles one weekday digit in a days string, keeping it sorted. */
export const toggleDay = (d: string, day: string): string =>
  (d.includes(day) ? d.replace(day, "") : d + day).split("").toSorted().join("");

/** The next enabled alarm after `now`, looking up to a week ahead. */
export function nextAlarm(
  list: Alarm[],
  now = new Date(),
): { at: Date; alarm: Alarm; daysAhead: number } | null {
  const enabled = list.filter((a) => a.on && a.d);
  for (let add = 0; add <= 7; add++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    const iso = String(((day.getDay() + 6) % 7) + 1);
    const today = enabled.filter((a) => a.d.includes(iso)).toSorted((a, b) => a.t.localeCompare(b.t));
    for (const alarm of today) {
      const at = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Number(alarm.t.slice(0, 2)),
        Number(alarm.t.slice(2)),
      );
      if (at > now) return { at, alarm, daysAhead: add };
    }
  }
  return null;
}

/** "07:30" in 24-hour time, or { time: "7:30", ampm: "AM" } for 12-hour time. */
export function formatAlarmTime(t: string, use12h: boolean): { time: string; ampm?: string } {
  const h = Number(t.slice(0, 2));
  const m = t.slice(2);
  if (!use12h) return { time: `${String(h).padStart(2, "0")}:${m}` };
  return { time: `${((h + 11) % 12) + 1}:${m}`, ampm: h < 12 ? "AM" : "PM" };
}
