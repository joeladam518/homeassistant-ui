import { type CardProps, createCardElement } from "@joeladam518/shared-cards/card-element.tsx";
import { relTime } from "@joeladam518/shared-cards/format.ts";
import { useNow } from "@joeladam518/shared-cards/hooks.ts";
import { fireMoreInfo } from "@joeladam518/shared-cards/more-info.ts";
import { useToast } from "@joeladam518/shared-cards/toast.tsx";
import type { EntityState, HomeAssistant, LovelaceCardConfig } from "@joeladam518/shared-cards/types.ts";
import type { FunctionComponent as FC } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
  DEFAULT_FAVORITES,
  type Favorite,
  favoriteDisplayRgb,
  favoriteMatches,
  favoriteRgb,
  hexToRgb,
  hsToRgb,
  isWhiteFavorite,
  type Rgb,
  rgbToHs,
} from "./color.ts";
import { drawWheel, markerPosition, pointerHs } from "./wheel.ts";

import cardCss from "./card.css?inline";
import baseCss from "@joeladam518/shared-cards/base.css?inline";
import switchCss from "@joeladam518/shared-cards/switch.css?inline";
import toastCss from "@joeladam518/shared-cards/toast.css?inline";

type EntityRef = string | { entity: string; name?: string; icon?: string };

export interface RgbLightCardConfig extends LovelaceCardConfig {
  /** A colour light (required). */
  entity: string;
  name?: string;
  icon?: string;
  /** Extra toggles shown on the card, e.g. a "Twinkle" mode switch. */
  switches?: EntityRef[];
  /** Event entities (button inputs) to show, e.g. a Shelly's inputs. */
  inputs?: EntityRef[];
  /** Effects you don't want buttons for. */
  hide_effects?: string[];
  /** Favourite colours; defaults to nine. */
  favorites?: Favorite[];
  /** Fade time in seconds for every change (on, off, colour, brightness). Off by default. */
  transition?: number;
}

type Config = RgbLightCardConfig & { favorites: Favorite[] };

const EVENT_LABELS: Record<string, string> = {
  single_push: "Single press",
  double_push: "Double press",
  triple_push: "Triple press",
  long_push: "Long press",
  btn_down: "Pressed",
  btn_up: "Released",
};

/** `supported_features` bit for lights that can fade (LightEntityFeature.TRANSITION). */
const SUPPORTS_TRANSITION = 32;

/** Colour updates while dragging go out at most this often. */
const DRAG_SEND_MS = 350;

const refId = (r: EntityRef): string => (typeof r === "string" ? r : r.entity);
const refName = (r: EntityRef): string | undefined => (typeof r === "string" ? undefined : r.name);
const isUnavailable = (s: EntityState | undefined): boolean =>
  !s || s.state === "unavailable" || s.state === "unknown";

/**
 * A colour light with a drag-to-pick colour wheel, a brightness slider, favourite colours,
 * effects, extra switches (e.g. a "Twinkle" mode) and button inputs (e.g. Shelly inputs).
 */
export const RgbLightCard: FC<CardProps<Config>> = ({ config: c, hass, host }) => {
  /** Where the user is dragging on the wheel; the marker follows it instead of the light. */
  const [dragHs, setDragHs] = useState<[number, number] | null>(null);
  const dragging = useRef(false);
  const lastSend = useRef(0);
  const dragEndTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { show: showToast, toast } = useToast();

  // keeps the inputs' "5m ago" current
  useNow(30_000);

  // The canvas is created once with the card, so paint it once.
  useEffect(() => {
    if (canvas.current) {
      drawWheel(canvas.current);
    }
  }, []);

  useEffect(() => () => clearTimeout(dragEndTimer.current), []);

  const st = hass.states[c.entity];
  const a = st?.attributes ?? {};
  const modes = (a.supported_color_modes as string[] | undefined) || [];
  const on = st?.state === "on";
  const unavailable = !!st && isUnavailable(st);

  // On an RGBW light, HA's rgb_color blends the white LEDs in. Use the colour channels alone,
  // so the marker and favourites don't move when white is added.
  const rgbw = a.color_mode === "rgbw" ? (a.rgbw_color as number[] | undefined) : undefined;
  const colorRgb = rgbw ? (rgbw.slice(0, 3) as Rgb) : (a.rgb_color as Rgb | undefined);
  /** The white LEDs, 0–255. */
  const white = on && rgbw ? rgbw[3]! : 0;
  /** On the white LEDs only, no colour. */
  const isWhite =
    on && ((!!rgbw && white > 0 && Math.max(...rgbw.slice(0, 3)) < 30) || a.color_mode === "white");

  /* --------------------------------------------------------- actions */

  const canFade = !!c.transition && (Number(a.supported_features) & SUPPORTS_TRANSITION) !== 0;

  /** Calls a light service, with the fade time if set. `live` (dragging) never fades: it would lag. */
  const callLight = (service: string, data: Record<string, unknown> = {}, live = false): void => {
    const fade = canFade && !live ? { transition: Number(c.transition) } : {};
    hass
      .callService("light", service, { entity_id: c.entity, ...data, ...fade })
      .catch((e: unknown) => showToast((e as Error)?.message || "That didn't work"));
  };

  const turnOn = (data: Record<string, unknown>, live = false): void => callLight("turn_on", data, live);

  const setColor = (rgb: Rgb, live = false): void => {
    if (modes.includes("rgbw")) {
      // Keep the white level, unless the light is on white only: then switch to the colour.
      turnOn({ rgbw_color: [...rgb, isWhite ? 0 : white] }, live);
    } else if (modes.includes("rgbww")) {
      turnOn({ rgbww_color: [...rgb, 0, 0] }, live);
    } else {
      turnOn({ rgb_color: rgb }, live);
    }
  };

  const setWhite = (): void => {
    if (modes.includes("rgbw")) {
      turnOn({ rgbw_color: [0, 0, 0, 255] });
    } else if (modes.includes("rgbww")) {
      turnOn({ rgbww_color: [0, 0, 0, 255, 255] });
    } else if (modes.includes("white")) {
      turnOn({ white: st?.attributes?.brightness || 255 });
    } else {
      turnOn({ rgb_color: [255, 255, 255] });
    }
  };

  /** The white LEDs on an RGBW light, keeping the colour channels as they are. */
  const setWhiteLevel = (pct: number): void => {
    const w = Math.round((pct / 100) * 255);
    const keep: Rgb = on && colorRgb ? colorRgb : [0, 0, 0];
    if (w === 0 && Math.max(...keep) === 0) {
      // nothing left lit
      callLight("turn_off");
      return;
    }
    turnOn({ rgbw_color: [...keep, w] });
  };

  const toggle = (e: Event): void => {
    e.stopPropagation();
    callLight("toggle");
  };

  const pick = (ev: PointerEvent, final: boolean): void => {
    const [h, s] = pointerHs(ev, ev.currentTarget as HTMLElement);
    setDragHs([h, s]);
    const now = Date.now();
    if (final || now - lastSend.current > DRAG_SEND_MS) {
      lastSend.current = now;
      setColor(hsToRgb(h, s), !final);
    }
  };

  const onPointerDown = (ev: PointerEvent): void => {
    ev.preventDefault();
    clearTimeout(dragEndTimer.current);
    try {
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    } catch {
      // capture not available – dragging still works inside the wheel
    }
    dragging.current = true;
    pick(ev, false);
  };

  const onPointerMove = (ev: PointerEvent): void => {
    if (dragging.current) {
      pick(ev, false);
    }
  };

  const onPointerUp = (ev: PointerEvent): void => {
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    pick(ev, true);
    // Hold the marker where it was dropped until the light reports its new colour.
    dragEndTimer.current = setTimeout(() => setDragHs(null), 1500);
  };

  const onFavorite = (f: Favorite): void => {
    if (isWhiteFavorite(f)) {
      setWhite();
    } else {
      setColor(hexToRgb(f.color) || [255, 255, 255]);
    }
  };

  /* ---------------------------------------------------------- render */

  const hs = rgbw ? rgbToHs(rgbw.slice(0, 3) as Rgb) : (a.hs_color as [number, number] | undefined);
  const current: Rgb | "white" | null = on ? (isWhite ? "white" : (colorRgb ?? null)) : null;
  /** The favourite the light is showing, if any. */
  const active = c.favorites.find((f) => favoriteMatches(f, current));
  // Tint the card with the favourite's displayColor, if it has one: that's what the light looks like.
  const rgb: Rgb = on
    ? ((active && favoriteDisplayRgb(active)) ??
      (isWhite
        ? [255, 244, 229]
        : (a.rgb_color as Rgb | undefined) || (hs ? hsToRgb(hs[0], hs[1]) : [255, 255, 255])))
    : [140, 140, 140];

  const pct = on && a.brightness != null ? Math.round((Number(a.brightness) / 255) * 100) : null;
  const effect = on && a.effect && a.effect !== "solid" && a.effect !== "None" ? String(a.effect) : null;
  const sub = !st
    ? "Entity not found"
    : unavailable
      ? "Unavailable"
      : on
        ? ["On", pct != null ? `${pct}%` : null, effect, isWhite ? "White" : null].filter(Boolean).join(" · ")
        : "Off";

  const [mh, ms] = dragHs ?? (on && hs && !isWhite ? hs : [0, 0]);

  const hidden = new Set((c.hide_effects || []).map((x) => String(x).toLowerCase()));
  const effects = ((a.effect_list as string[] | undefined) || []).filter(
    (e) => e && !hidden.has(String(e).toLowerCase()),
  );

  return (
    <ha-card
      class={!st || unavailable ? "unavailable" : on ? "on" : "off"}
      style={{ "--light": `rgb(${rgb.join(",")})` }}
    >
      <div class="top">
        <button class="icon-btn" aria-label="Toggle" onClick={toggle}>
          <ha-icon icon={c.icon || (a.icon as string | undefined) || "mdi:led-strip-variant"} />
        </button>
        <div
          class="info"
          role="button"
          tabIndex={0}
          onClick={() => fireMoreInfo(host, c.entity)}
          onKeyDown={(e) => e.key === "Enter" && fireMoreInfo(host, c.entity)}
        >
          <div class="name">{c.name || (a.friendly_name as string | undefined) || c.entity}</div>
          <div class="sub">{sub}</div>
        </div>
        <button
          class={`switch big ${on ? "on" : ""}`}
          aria-label="Toggle"
          disabled={unavailable}
          onClick={toggle}
        >
          <span />
        </button>
      </div>

      <div class="picker">
        <div
          class="wheel-wrap"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (dragging.current = false)}
        >
          <canvas ref={canvas} width={400} height={400} aria-label="Color wheel" />
          <div
            class="marker"
            hidden={!on}
            style={{ ...markerPosition(mh, ms), background: `rgb(${hsToRgb(mh, ms).join(",")})` }}
          />
        </div>
      </div>

      <Level
        kind="bri"
        icon="mdi:brightness-6"
        label="Brightness"
        min={1}
        value={pct}
        disabled={unavailable}
        onSet={(v) => turnOn({ brightness_pct: v })}
      />

      {modes.includes("rgbw") && (
        <Level
          kind="white"
          icon="mdi:white-balance-sunny"
          label="White"
          min={0}
          value={on ? Math.round((white / 255) * 100) : null}
          disabled={unavailable}
          onSet={setWhiteLevel}
        />
      )}

      <div class="favs">
        {c.favorites.map((f) => (
          <button
            key={f.name}
            class={`fav ${f === active ? "active" : ""}`}
            title={f.name}
            aria-label={f.name}
            style={{ "--c": `rgb(${favoriteRgb(f).join(",")})` }}
            onClick={() => onFavorite(f)}
          />
        ))}
      </div>

      {effects.length > 0 && (
        <div class="effects">
          <span class="lbl">Effect</span>
          {effects.map((e) => (
            <button
              key={e}
              class={`chip ${on && a.effect === e ? "on" : ""}`}
              onClick={() => turnOn({ effect: e })}
            >
              {e[0]!.toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      )}

      {!!c.switches?.length && (
        <div class="extras">
          {c.switches.map((s) => (
            <SwitchRow key={refId(s)} entityRef={s} hass={hass} host={host} />
          ))}
        </div>
      )}

      {!!c.inputs?.length && (
        <>
          <div class="subhead">Inputs</div>
          <div class="inputs">
            {c.inputs.map((s, i) => (
              <InputButton key={refId(s)} entityRef={s} index={i} hass={hass} host={host} />
            ))}
          </div>
        </>
      )}

      {toast}
    </ha-card>
  );
};

interface LevelProps {
  /** The CSS class: `bri` or `white`. */
  kind: string;
  icon: string;
  label: string;
  min: number;
  /** The light's value in %, or null when it has none (e.g. off). */
  value: number | null;
  disabled: boolean;
  /** Called with the new % when the user lets go. */
  onSet: (pct: number) => void;
}

/** A 0–100% slider that holds the user's value while they drag. */
const Level: FC<LevelProps> = ({ kind, icon, label, min, value, disabled, onSet }) => {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  return (
    <div class={`level ${kind}`}>
      <ha-icon icon={icon} />
      <input
        type="range"
        min={min}
        max={100}
        step={1}
        aria-label={label}
        value={String(shown ?? 0)}
        disabled={disabled}
        onInput={(e) => setDraft(Number(e.currentTarget.value))}
        onChange={(e) => onSet(Number(e.currentTarget.value))}
        onBlur={() => setDraft(null)}
      />
      <span class="val">{shown != null ? `${shown}%` : "–"}</span>
    </div>
  );
};

interface RowProps {
  entityRef: EntityRef;
  hass: HomeAssistant;
  host: HTMLElement;
}

const SwitchRow: FC<RowProps> = ({ entityRef, hass, host }) => {
  const id = refId(entityRef);
  const s = hass.states[id];
  const icon = (typeof entityRef === "object" && entityRef.icon) || "mdi:shimmer";

  return (
    <div class="row">
      <ha-icon icon={icon} />
      <span class="row-name" onClick={() => fireMoreInfo(host, id)}>
        {refName(entityRef) || (s?.attributes?.friendly_name as string | undefined) || id}
      </span>
      <button
        class={`switch ${s?.state === "on" ? "on" : ""}`}
        aria-label="Toggle"
        disabled={!s || s.state === "unavailable"}
        onClick={() => hass.callService("homeassistant", "toggle", { entity_id: id })}
      >
        <span />
      </button>
    </div>
  );
};

const InputButton: FC<RowProps & { index: number }> = ({ entityRef, index, hass, host }) => {
  const id = refId(entityRef);
  const s = hass.states[id];
  const type = s?.attributes?.event_type as string | undefined;
  // An event entity's state is the time of its last event.
  const when = s && !isUnavailable(s) ? s.state : null;
  const recent = !!when && Date.now() - Date.parse(when) < 60_000;

  return (
    <button class={`input ${recent ? "recent" : ""}`} onClick={() => fireMoreInfo(host, id)}>
      <span class="in-name">{refName(entityRef) || `Input ${index + 1}`}</span>
      <span class="in-last">
        {when ? `${(type && EVENT_LABELS[type]) || type || "Pressed"} · ${relTime(when)}` : "No presses yet"}
      </span>
    </button>
  );
};

export const RgbLightCardElement = createCardElement(RgbLightCard, {
  styles: [baseCss, switchCss, toastCss, cardCss],
  config: (config: RgbLightCardConfig): Config => {
    if (!config?.entity) {
      throw new Error("Set 'entity' to a color light");
    }
    if (config.transition != null && !(Number(config.transition) >= 0)) {
      throw new Error("Set 'transition' to a number of seconds, e.g. 2");
    }
    return { ...config, favorites: config.favorites ?? DEFAULT_FAVORITES };
  },
  watch: (c) => [c.entity, ...(c.switches || []).map(refId), ...(c.inputs || []).map(refId)],
  cardSize: 7,
  gridOptions: { columns: 12, rows: "auto", min_columns: 6 },
  stubConfig: (hass) => {
    const light = Object.keys(hass?.states || {}).find(
      (id) =>
        id.startsWith("light.") &&
        ((hass.states[id]?.attributes.supported_color_modes as string[] | undefined) || []).some((m) =>
          ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(m),
        ),
    );
    return { entity: light || "light.example" };
  },
});

export type RgbLightCardElement = InstanceType<typeof RgbLightCardElement>;
