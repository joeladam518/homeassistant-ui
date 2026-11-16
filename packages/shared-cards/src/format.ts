/**
 * How long ago an ISO time was.
 * - `"short"`: "just now", "5m ago", "3h ago", "2d ago"
 * - `"spaced"`: "just now", "5 min ago", "3 h ago", "2 d ago"
 */
export function relTime(iso: string | null | undefined, style: "short" | "spaced" = "short"): string {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (style === "short") {
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/**
 * An `mdi:battery-*` icon in 10 % steps.
 * `alertAt`: at or below this level (and not charging), show the "battery alert" icon instead.
 */
export function batteryIcon(
  pct: number | null | undefined,
  { charging = false, alertAt }: { charging?: boolean; alertAt?: number } = {},
): string {
  if (pct == null) return "mdi:battery-unknown";
  if (!charging && alertAt != null && pct <= alertAt) return "mdi:battery-alert-variant-outline";
  const step = Math.max(10, Math.min(100, Math.round(pct / 10) * 10));
  if (charging) return `mdi:battery-charging-${step}`;
  return step === 100 ? "mdi:battery" : `mdi:battery-${step}`;
}
