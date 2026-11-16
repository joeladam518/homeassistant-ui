import { entity, type FakeHass, fakeHass, flush as tick } from "@joeladam518/shared-awtrix/test-helpers.ts";
import { act, flush } from "@joeladam518/shared-cards/testing.ts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AwtrixNgBroadcastCardElement as AwtrixNgBroadcastCard } from "./broadcast-card.tsx";

beforeAll(async () => {
  await import("./index.ts");
});

beforeEach(() => localStorage.clear());

const prefixSensors = () => ({
  "sensor.kitchen_mqtt_prefix": entity("sensor.kitchen_mqtt_prefix", "clock1"),
  "sensor.office_mqtt_prefix": entity("sensor.office_mqtt_prefix", "clock2"),
});

async function mount(hass: FakeHass, config: Record<string, unknown> = {}): Promise<AwtrixNgBroadcastCard> {
  const card = document.createElement("awtrix-ng-broadcast-card") as AwtrixNgBroadcastCard;
  await act(() => {
    card.setConfig({ type: "custom:awtrix-ng-broadcast-card", ...config });
    card.hass = hass;
    document.body.append(card);
  });
  // let the MQTT subscriptions finish
  await tick();
  return card;
}

const $ = <T extends Element = HTMLElement>(card: AwtrixNgBroadcastCard, sel: string) =>
  card.shadowRoot!.querySelector<T>(sel)!;
const targets = (card: AwtrixNgBroadcastCard) => [
  ...card.shadowRoot!.querySelectorAll<HTMLElement>(".target"),
];

describe("awtrix-ng-broadcast-card", () => {
  it("finds every clock and selects them all", async () => {
    const card = await mount(fakeHass(prefixSensors()));
    expect(targets(card).map((t) => t.textContent!.trim())).toEqual(["clock1", "clock2"]);
    expect(targets(card).every((t) => t.classList.contains("on"))).toBe(true);
  });

  it("sends to the selected clocks only", async () => {
    const hass = fakeHass(prefixSensors());
    const card = await mount(hass, { clocks: [{ prefix: "clock1", name: "Kitchen" }, "clock2"] });
    targets(card)[1]!.click(); // deselect clock2
    await flush();
    $<HTMLInputElement>(card, "#text").value = "Dinner!";
    $(card, ".bc-row .btn").click();
    await flush();
    expect(hass.published().map(([topic]) => topic)).toEqual(["clock1/cmd/notify"]);
    expect($(card, ".toast").textContent!.trim()).toBe("Sent to Kitchen");
  });

  it("marks offline clocks", async () => {
    const hass = fakeHass(prefixSensors());
    const card = await mount(hass);
    hass.mqtt("clock2/availability", "offline");
    await flush();
    expect(targets(card)[1]!.classList.contains("offline")).toBe(true);
  });

  it("dismisses on every selected clock", async () => {
    const hass = fakeHass(prefixSensors());
    const card = await mount(hass);
    $(card, ".bc-opts .btn.ghost").click();
    await flush();
    expect(hass.published()).toEqual([
      ["clock1/cmd/notify/dismiss", ""],
      ["clock2/cmd/notify/dismiss", ""],
    ]);
  });
});
