import { type CardProps, createCardElement } from "@joeladam518/shared-cards/card-element.tsx";
import { relTime } from "@joeladam518/shared-cards/format.ts";
import { useNow } from "@joeladam518/shared-cards/hooks.ts";
import { fireMoreInfo } from "@joeladam518/shared-cards/more-info.ts";
import { useToast } from "@joeladam518/shared-cards/toast.tsx";
import type { EntityState, HomeAssistant, LovelaceCardConfig } from "@joeladam518/shared-cards/types.ts";
import { useEffect, useRef, useState } from "preact/hooks";

import {
  DEFAULT_FAVORITES,
  type Favorite,
  favoriteMatches,
  favoriteRgb,
  hexToRgb,
  hsToRgb,
  isWhiteFavorite,
  type Rgb,
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
export function RgbLightCard({ config: c, hass, host }: CardProps<Config>) {
  /** Where the user is dragging on the wheel; the marker follows it instead of the light. */
  const [dragHs, setDragHs] = useState<[number, number] | null>(null);
  /** The brightness slider value while the user is using it. */
  const [briDraft, setBriDraft] = useState<number | null>(null);
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
  const modes = (st?.attributes?.supported_color_modes as string[] | undefined) || [];

  /* --------------------------------------------------------- actions */

  const turnOn = (data: Record<string, unknown>): void => {
    hass
      .callService("light", "turn_on", { entity_id: c.entity, ...data })
      .catch((e: unknown) => showToast((e as Error)?.message || "That didn't work"));
  };

  const setColor = (rgb: Rgb): void => {
    if (modes.includes("rgbw")) {
      turnOn({ rgbw_color: [...rgb, 0] });
    } else if (modes.includes("rgbww")) {
      turnOn({ rgbww_color: [...rgb, 0, 0] });
    } else {
      turnOn({ rgb_color: rgb });
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

  const toggle = (e: Event): void => {
    e.stopPropagation();
    void hass.callService("light", "toggle", { entity_id: c.entity });
  };

  const pick = (ev: PointerEvent, final: boolean): void => {
    const [h, s] = pointerHs(ev, ev.currentTarget as HTMLElement);
    setDragHs([h, s]);
    const now = Date.now();
    if (final || now - lastSend.current > DRAG_SEND_MS) {
      lastSend.current = now;
      setColor(hsToRgb(h, s));
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

  const a = st?.attributes ?? {};
  const on = st?.state === "on";
  const unavailable = !!st && isUnavailable(st);

  const rgbw = a.rgbw_color as number[] | undefined;
  const isWhite =
    on &&
    ((a.color_mode === "rgbw" && !!rgbw && rgbw[3]! > 0 && Math.max(...rgbw.slice(0, 3)) < 30) ||
      a.color_mode === "white");
  const hs = a.hs_color as [number, number] | undefined;
  const rgb: Rgb = on
    ? isWhite
      ? [255, 244, 229]
      : (a.rgb_color as Rgb | undefined) || (hs ? hsToRgb(hs[0], hs[1]) : [255, 255, 255])
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
  const current: Rgb | "white" | null = on
    ? isWhite
      ? "white"
      : ((a.rgb_color as Rgb | undefined) ?? null)
    : null;

  const hidden = new Set((c.hide_effects || []).map((x) => String(x).toLowerCase()));
  const effects = ((a.effect_list as string[] | undefined) || []).filter(
    (e) => e && !hidden.has(String(e).toLowerCase()),
  );
  const bri = briDraft ?? pct ?? 0;

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

      <div class="bri">
        <ha-icon icon="mdi:brightness-6" />
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          aria-label="Brightness"
          value={String(bri)}
          disabled={unavailable}
          onInput={(e) => setBriDraft(Number(e.currentTarget.value))}
          onChange={(e) => turnOn({ brightness_pct: Number(e.currentTarget.value) })}
          onBlur={() => setBriDraft(null)}
        />
        <span class="val">{briDraft != null ? `${briDraft}%` : pct != null ? `${pct}%` : "–"}</span>
      </div>

      <div class="favs">
        {c.favorites.map((f) => (
          <button
            key={f.name}
            class={`fav ${favoriteMatches(f, current) ? "active" : ""}`}
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
}

interface RowProps {
  entityRef: EntityRef;
  hass: HomeAssistant;
  host: HTMLElement;
}

function SwitchRow({ entityRef, hass, host }: RowProps) {
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
}

function InputButton({ entityRef, index, hass, host }: RowProps & { index: number }) {
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
}

export const RgbLightCardElement = createCardElement(RgbLightCard, {
  styles: [baseCss, switchCss, toastCss, cardCss],
  config: (config: RgbLightCardConfig): Config => {
    if (!config?.entity) {
      throw new Error("Set 'entity' to a color light");
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
