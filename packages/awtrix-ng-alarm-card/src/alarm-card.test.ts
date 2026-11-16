import { entity, type FakeHass, fakeHass } from "@joeladam518/shared-awtrix/test-helpers.ts";
import { beforeAll, describe, expect, it } from "vitest";

import type { AwtrixNgAlarmCard } from "./alarm-card.ts";

beforeAll(async () => {
  await import("./index.ts");
});

const states = (alarms = "0730:12345:1,0900:67:0", sound = "Beep") => ({
  "input_text.tc002_alarms": entity("input_text.tc002_alarms", alarms, { max: 255 }),
  "input_boolean.tc002_alarms_enabled": entity("input_boolean.tc002_alarms_enabled", "on"),
  "input_select.tc002_alarm_sound": entity("input_select.tc002_alarm_sound", sound, {
    options: ["Beep", "MP3 from URL", "Phone: spoken message"],
  }),
  "input_number.tc002_alarm_volume": entity("input_number.tc002_alarm_volume", "60.0"),
  "input_number.tc002_alarm_ring_time": entity("input_number.tc002_alarm_ring_time", "5"),
  "script.tc002_ring_alarm": entity("script.tc002_ring_alarm", "off"),
});

async function mount(hass: FakeHass): Promise<AwtrixNgAlarmCard> {
  const card = document.createElement("awtrix-ng-alarm-card") as AwtrixNgAlarmCard;
  card.setConfig({ type: "custom:awtrix-ng-alarm-card", title: "Bedroom alarm" });
  card.hass = hass;
  document.body.append(card);
  await card.updateComplete;
  return card;
}

const $ = <T extends Element = HTMLElement>(card: AwtrixNgAlarmCard, sel: string) =>
  card.shadowRoot!.querySelector<T>(sel)!;
const $$ = (card: AwtrixNgAlarmCard, sel: string) => [...card.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const setValueCall = (hass: FakeHass) =>
  (hass.callService as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
    ([d, s]) => d === "input_text" && s === "set_value",
  )?.[2];

describe("awtrix-ng-alarm-card", () => {
  it("lists the alarms with their days and the master switch", async () => {
    const card = await mount(fakeHass(states()));
    expect(clean($(card, ".name").textContent)).toBe("Bedroom alarm");
    expect($$(card, ".alarm").map((a) => clean(a.querySelector(".days-sum")!.textContent))).toEqual([
      "Weekdays",
      "Weekends",
    ]);
    expect($$(card, ".alarm")[1]!.classList.contains("off")).toBe(true);
    expect($(card, ".head .switch").classList.contains("on")).toBe(true);
    expect(clean($(card, ".sub").textContent)).toMatch(/^Next: /);
  });

  it("adds an alarm", async () => {
    const hass = fakeHass(states());
    const card = await mount(hass);
    $<HTMLInputElement>(card, "#addTime").value = "06:15";
    $<HTMLSelectElement>(card, "#addDays").value = "67";
    $(card, ".add .btn").click();
    await card.updateComplete;
    expect(setValueCall(hass)).toEqual({
      entity_id: "input_text.tc002_alarms",
      value: "0615:67:1,0730:12345:1,0900:67:0",
    });
    expect($$(card, ".alarm")).toHaveLength(3); // shown straight away
    expect(clean($(card, ".toast").textContent)).toBe("Alarm added: 06:15, Weekends");
  });

  it("refuses a duplicate alarm", async () => {
    const hass = fakeHass(states());
    const card = await mount(hass);
    $<HTMLInputElement>(card, "#addTime").value = "07:30";
    $<HTMLSelectElement>(card, "#addDays").value = "12345";
    $(card, ".add .btn").click();
    await card.updateComplete;
    expect(setValueCall(hass)).toBeUndefined();
    expect(clean($(card, ".toast").textContent)).toBe("That alarm already exists");
  });

  it("toggles a day and needs a second tap to delete", async () => {
    const hass = fakeHass(states());
    const card = await mount(hass);
    $$(card, ".alarm")[0]!.querySelectorAll<HTMLElement>(".day")[5]!.click(); // add Saturday
    expect(setValueCall(hass)).toEqual({
      entity_id: "input_text.tc002_alarms",
      value: "0730:123456:1,0900:67:0",
    });

    const del = () => $$(card, ".alarm")[1]!.querySelector<HTMLElement>(".del")!;
    del().click();
    await card.updateComplete;
    expect(clean(del().textContent)).toBe("Delete?");
    del().click();
    await card.updateComplete;
    expect($$(card, ".alarm")).toHaveLength(1);
  });

  it("shows the phone message fields only for the phone sound", async () => {
    const card = await mount(fakeHass(states(undefined, "Phone: spoken message")));
    const visible = $$(card, ".panel .line")
      .filter((l) => !l.hidden)
      .map((l) => clean(l.querySelector("span")!.textContent));
    expect(visible).toEqual(["Sound", "Message", "Repeat for"]);
  });

  it("shows volume and ring time for other sounds", async () => {
    const card = await mount(fakeHass(states()));
    const lines = $$(card, ".panel .line").filter((l) => !l.hidden);
    expect(lines.map((l) => clean(l.querySelector("span")!.textContent))).toEqual([
      "Sound",
      "Volume",
      "Ring for",
    ]);
    expect(lines.map((l) => clean(l.querySelector(".val")?.textContent))).toEqual(["", "60%", "5 min"]);
  });
});
