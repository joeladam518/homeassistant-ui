import type { HomeAssistant } from "./types.ts";

/** The other `sensor.*` entities on the same device as `entityId`. */
export function siblingSensors(hass: HomeAssistant, entityId: string): string[] {
  const device = hass.entities?.[entityId]?.device_id;
  if (!device) return [];
  return Object.values(hass.entities)
    .filter((e) => e.device_id === device && e.entity_id.startsWith("sensor."))
    .map((e) => e.entity_id);
}

/** The area name of an entity, falling back to its device's area. */
export function entityAreaName(hass: HomeAssistant, entityId: string): string | undefined {
  const entry = hass.entities?.[entityId];
  const areaId = entry?.area_id || (entry?.device_id ? hass.devices?.[entry.device_id]?.area_id : undefined);
  return areaId ? hass.areas?.[areaId]?.name : undefined;
}

/** A number from an entity's state, or null when it isn't one (unavailable, unknown, …). */
export function numericState(hass: HomeAssistant, entityId: string | null | undefined): number | null {
  const state = entityId ? hass.states[entityId]?.state : undefined;
  if (state == null) return null;
  const n = parseFloat(state);
  return Number.isNaN(n) ? null : n;
}
