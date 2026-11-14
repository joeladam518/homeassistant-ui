import { vi } from "vitest";

import type { HomeAssistant } from "../lib/types.ts";
import type { MqttMessage } from "./mqtt.ts";

export const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state,
  attributes,
  context: { id: "", parent_id: null, user_id: null },
  last_changed: "",
  last_updated: "",
});

/** Does an MQTT topic filter (only "x/#" wildcards) match a topic? */
const matches = (filter: string, topic: string) =>
  filter.endsWith("/#") ? topic.startsWith(filter.slice(0, -1)) : filter === topic;

export interface FakeHass extends HomeAssistant {
  /** Deliver an MQTT message to every subscription whose topic matches. */
  mqtt(topic: string, payload: unknown): void;
  /** The mqtt.publish calls so far, as [topic, payload]. */
  published(): [string, string][];
}

/** A fake `hass` with a fake MQTT broker behind `connection.subscribeMessage`. */
export function fakeHass(states: FakeHass["states"] = {}, { admin = true } = {}): FakeHass {
  const subs: { topic: string; cb: (m: MqttMessage) => void }[] = [];
  const callService = vi.fn((..._args: unknown[]) => Promise.resolve());
  const hass = {
    states,
    entities: {},
    devices: {},
    areas: {},
    config: { unit_system: { temperature: "°C" } } as unknown as HomeAssistant["config"],
    locale: { language: "en-US", time_format: "24" },
    connection: {
      subscribeMessage: vi.fn((cb: (m: MqttMessage) => void, msg: { topic: string }) => {
        if (!admin) return Promise.reject({ code: "unauthorized", message: "Unauthorized" });
        const sub = { topic: msg.topic, cb };
        subs.push(sub);
        return Promise.resolve(() => subs.splice(subs.indexOf(sub), 1));
      }),
    } as unknown as HomeAssistant["connection"],
    callService: callService as HomeAssistant["callService"],
    callWS: vi.fn() as HomeAssistant["callWS"],
    mqtt(topic: string, payload: unknown) {
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      for (const s of subs.filter((x) => matches(x.topic, topic))) s.cb({ topic, payload: text });
    },
    published: () =>
      callService.mock.calls
        .filter(([domain, service]) => domain === "mqtt" && service === "publish")
        .map(([, , data]) => {
          const d = data as { topic: string; payload: string };
          return [d.topic, d.payload] as [string, string];
        }),
  };
  return hass;
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
