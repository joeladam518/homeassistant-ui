// Shared helper — the same file is copied into each homeassistant-* card repo. Keep the copies identical.
import type { Connection, HassConfig, HassEntity, HassServiceTarget } from "home-assistant-js-websocket";

/** An entity state. `last_reported` is newer than the types in home-assistant-js-websocket. */
export type EntityState = HassEntity & { last_reported?: string };

/** Entity registry entry as the frontend sees it (`hass.entities`). */
export interface EntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  name?: string | null;
  icon?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
}

/** The parts of the frontend's `hass` object these cards use. */
export interface HomeAssistant {
  states: Record<string, EntityState>;
  entities: Record<string, EntityRegistryEntry>;
  devices: Record<string, DeviceRegistryEntry>;
  areas: Record<string, AreaRegistryEntry>;
  config: HassConfig;
  locale: { language: string; time_format?: string };
  connection: Connection;
  user?: { is_admin: boolean };
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: HassServiceTarget,
  ): Promise<unknown>;
  callWS<T>(msg: { type: string; [key: string]: unknown }): Promise<T>;
}

export interface LovelaceCardConfig {
  type: string;
  [key: string]: unknown;
}

export interface LovelaceGridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  min_columns?: number;
  min_rows?: number;
}

/** An entry in `window.customCards`, which lists the card in the dashboard's card picker. */
export interface CustomCardEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}
