import { act, flush } from "@joeladam518/shared-cards/testing.ts";
import type { HomeAssistant } from "@joeladam518/shared-cards/types.ts";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { RgbLightCardElement as RgbLightCard } from "./card.tsx";

beforeAll(async () => {
  await import("./index.ts");
});

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({
  entity_id,
  state,
  attributes,
  context: { id: "", parent_id: null, user_id: null },
  last_changed: "",
  last_updated: "",
});

function fakeHass(light: Record<string, unknown> = {}, state = "on"): HomeAssistant {
  return {
    states: {
      "light.tree": entity("light.tree", state, {
        friendly_name: "Tree",
        supported_color_modes: ["rgbw"],
        color_mode: "rgbw",
        rgb_color: [255, 0, 0],
        rgbw_color: [255, 0, 0, 0],
        hs_color: [0, 100],
        brightness: 128,
        effect_list: ["solid", "rainbow", "twinkle"],
        effect: "solid",
        ...light,
      }),
      "switch.twinkle": entity("switch.twinkle", "off", { friendly_name: "Tree Twinkle" }),
      "event.input_0": entity("event.input_0", new Date(Date.now() - 5 * 60_000).toISOString(), {
        event_type: "double_push",
      }),
      "event.input_1": entity("event.input_1", "unknown"),
    },
    entities: {},
    devices: {},
    areas: {},
    config: {} as HomeAssistant["config"],
    locale: { language: "en-US" },
    connection: {} as HomeAssistant["connection"],
    callService: vi.fn(() => Promise.resolve()),
    callWS: vi.fn() as HomeAssistant["callWS"],
  };
}

async function mount(config: Record<string, unknown> = {}, hass = fakeHass()): Promise<RgbLightCard> {
  const card = document.createElement("rgb-light-card") as RgbLightCard;
  await act(() => {
    card.setConfig({ type: "custom:rgb-light-card", entity: "light.tree", ...config });
    card.hass = hass;
    document.body.append(card);
  });
  return card;
}

const $ = <T extends Element = HTMLElement>(card: RgbLightCard, sel: string) =>
  card.shadowRoot!.querySelector<T>(sel)!;
const $$ = (card: RgbLightCard, sel: string) => [...card.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

describe("rgb-light-card", () => {
  it("is listed in the card picker", () => {
    expect(window.customCards?.some((c) => c.type === "rgb-light-card")).toBe(true);
  });

  it("shows the name, state, brightness and highlights the matching favourite", async () => {
    const card = await mount();
    expect(clean($(card, ".name").textContent)).toBe("Tree");
    expect(clean($(card, ".sub").textContent)).toBe("On · 50%");
    expect(clean($(card, ".val").textContent)).toBe("50%");
    expect($<HTMLInputElement>(card, "input[type=range]").value).toBe("50");
    expect($$(card, ".fav.active").map((b) => b.title)).toEqual(["Red"]);
    expect($(card, "ha-card").className).toBe("on");
  });

  it("sends rgbw_color for a favourite on an RGBW light, and the white LEDs for White", async () => {
    const hass = fakeHass();
    const card = await mount({}, hass);
    $(card, '.fav[title="Blue"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 0, 255, 0],
    });
    $(card, '.fav[title="White"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 0, 0, 255],
    });
  });

  it("shows effect chips without hidden ones and switches effect", async () => {
    const hass = fakeHass();
    const card = await mount({ hide_effects: ["Twinkle"] }, hass);
    expect($$(card, ".chip").map((b) => clean(b.textContent))).toEqual(["Solid", "Rainbow"]);
    $$(card, ".chip")[1]!.click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      effect: "rainbow",
    });
  });

  it("sets brightness when the slider is released", async () => {
    const hass = fakeHass();
    const card = await mount({}, hass);
    const slider = $<HTMLInputElement>(card, "input[type=range]");
    slider.value = "80";
    slider.dispatchEvent(new Event("input"));
    await flush();
    expect(clean($(card, ".val").textContent)).toBe("80%");
    slider.dispatchEvent(new Event("change"));
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      brightness_pct: 80,
    });
  });

  it("shows extra switches and inputs", async () => {
    const hass = fakeHass();
    const card = await mount(
      {
        switches: [{ entity: "switch.twinkle", name: "Twinkle" }],
        inputs: [{ entity: "event.input_0", name: "Button" }, "event.input_1"],
      },
      hass,
    );
    expect(clean($(card, ".row-name").textContent)).toBe("Twinkle");
    $(card, ".row .switch").click();
    expect(hass.callService).toHaveBeenCalledWith("homeassistant", "toggle", { entity_id: "switch.twinkle" });
    const inputs = $$(card, ".input").map((b) => [...b.children].map((c) => clean(c.textContent)));
    expect(inputs).toEqual([
      ["Button", "Double press · 5m ago"],
      ["Input 2", "No presses yet"],
    ]);
  });

  it("shows White when the RGBW light is on its white LEDs", async () => {
    const card = await mount({}, fakeHass({ rgbw_color: [0, 0, 0, 255], rgb_color: [255, 255, 255] }));
    expect(clean($(card, ".sub").textContent)).toBe("On · 50% · White");
    expect($$(card, ".fav.active").map((b) => b.title)).toEqual(["White"]);
  });

  it("shows a white slider only on RGBW lights", async () => {
    const rgbw = await mount({}, fakeHass({ rgbw_color: [255, 0, 0, 102] }));
    const slider = $<HTMLInputElement>(rgbw, '.white input[type="range"]');
    expect(slider.value).toBe("40");
    expect(clean($(rgbw, ".white .val").textContent)).toBe("40%");

    const rgb = await mount(
      {},
      fakeHass({ supported_color_modes: ["rgb"], color_mode: "rgb", rgbw_color: undefined }),
    );
    expect($$(rgb, ".white")).toEqual([]);
  });

  it("sets the white LEDs and keeps the colour", async () => {
    const hass = fakeHass({ rgbw_color: [0, 0, 255, 0], rgb_color: [0, 0, 255] });
    const card = await mount({}, hass);
    const slider = $<HTMLInputElement>(card, '.white input[type="range"]');
    slider.value = "50";
    slider.dispatchEvent(new Event("change"));
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 0, 255, 128],
    });
  });

  it("keeps the white level when picking a colour, and the favourite still matches", async () => {
    // HA blends the white into rgb_color; the card should go by the colour channels.
    const hass = fakeHass({ rgbw_color: [255, 0, 0, 128], rgb_color: [255, 128, 128] });
    const card = await mount({}, hass);
    expect($$(card, ".fav.active").map((b) => b.title)).toEqual(["Red"]);
    $(card, '.fav[title="Blue"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 0, 255, 128],
    });
  });

  it("switches from white-only to the pure colour", async () => {
    const hass = fakeHass({ rgbw_color: [0, 0, 0, 255], rgb_color: [255, 255, 255] });
    const card = await mount({}, hass);
    $(card, '.fav[title="Green"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 255, 0, 0],
    });
  });

  it("turns off when white goes to 0 with no colour", async () => {
    const hass = fakeHass({ rgbw_color: [0, 0, 0, 255], rgb_color: [255, 255, 255] });
    const card = await mount({}, hass);
    const slider = $<HTMLInputElement>(card, '.white input[type="range"]');
    slider.value = "0";
    slider.dispatchEvent(new Event("change"));
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_off", { entity_id: "light.tree" });
  });

  it("fades over `transition` seconds when the light supports it", async () => {
    const hass = fakeHass({ supported_features: 32 });
    const card = await mount({ transition: 2 }, hass);
    $(card, '.fav[title="Blue"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 0, 255, 0],
      transition: 2,
    });
    $(card, ".switch.big").click();
    expect(hass.callService).toHaveBeenCalledWith("light", "toggle", {
      entity_id: "light.tree",
      transition: 2,
    });
  });

  it("leaves transition out when the light can't fade", async () => {
    const hass = fakeHass({ supported_features: 0 });
    const card = await mount({ transition: 2 }, hass);
    $(card, '.fav[title="Blue"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [0, 0, 255, 0],
    });
  });

  it("rejects a transition that isn't a number", () => {
    const card = document.createElement("rgb-light-card") as RgbLightCard;
    // YAML can hand the card anything
    const transition = "slow" as unknown as number;
    expect(() => card.setConfig({ type: "custom:rgb-light-card", entity: "light.tree", transition })).toThrow(
      /transition/,
    );
  });

  it("shows a favourite's displayColor but sends its color", async () => {
    const hass = fakeHass({ rgbw_color: [0, 0, 255, 0], rgb_color: [0, 0, 255] });
    const card = await mount(
      { favorites: [{ name: "Amber", color: "#FF4000", displayColor: "#FFA000" }] },
      hass,
    );
    expect($(card, '.fav[title="Amber"]').style.getPropertyValue("--c")).toBe("rgb(255,160,0)");
    $(card, '.fav[title="Amber"]').click();
    expect(hass.callService).toHaveBeenCalledWith("light", "turn_on", {
      entity_id: "light.tree",
      rgbw_color: [255, 64, 0, 0],
    });
  });

  it("tints the card with the active favourite's displayColor", async () => {
    const card = await mount(
      { favorites: [{ name: "Amber", color: "#FF0000", displayColor: "#FFA000" }] },
      fakeHass({ rgbw_color: [255, 0, 0, 0], rgb_color: [255, 0, 0] }),
    );
    expect($$(card, ".fav.active").map((b) => b.title)).toEqual(["Amber"]);
    expect($(card, "ha-card").style.getPropertyValue("--light")).toBe("rgb(255,160,0)");
  });

  it("shows a toast when the light rejects a command", async () => {
    const hass = fakeHass();
    hass.callService = vi.fn(() => Promise.reject(new Error("Light is offline")));
    const card = await mount({}, hass);
    $(card, '.fav[title="Green"]').click();
    await vi.waitFor(() => expect(clean($(card, ".toast").textContent)).toBe("Light is offline"));
  });

  it("is off and greyed when the light is off", async () => {
    const card = await mount({}, fakeHass({}, "off"));
    expect(clean($(card, ".sub").textContent)).toBe("Off");
    expect($(card, "ha-card").className).toBe("off");
    expect($(card, ".marker").hidden).toBe(true);
  });
});
