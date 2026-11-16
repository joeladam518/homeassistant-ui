import type { HomeAssistant } from "./types.ts";

export type StatType = "mean" | "min" | "max";

export interface StatRow {
  start: number | string;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
}

/** 5-minute long-term statistics for the last `hours` hours, keyed by statistic id. */
export function fetchStats(
  hass: HomeAssistant,
  ids: string[],
  types: StatType[],
  hours = 24,
): Promise<Record<string, StatRow[] | undefined>> {
  return hass.callWS({
    type: "recorder/statistics_during_period",
    start_time: new Date(Date.now() - hours * 3600 * 1000).toISOString(),
    statistic_ids: ids,
    period: "5minute",
    types,
  });
}

/** A statistics row's start time in ms (the recorder sends ms numbers or ISO strings). */
export const rowTime = (row: StatRow): number =>
  typeof row.start === "number" ? row.start : Date.parse(row.start);
