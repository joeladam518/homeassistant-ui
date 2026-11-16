import { relTime } from "@joeladam518/shared-cards/format.ts";
import { fireMoreInfo } from "@joeladam518/shared-cards/more-info.ts";
import { ToastController } from "@joeladam518/shared-cards/toast.ts";
import type {
  EntityState,
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceGridOptions,
} from "@joeladam518/shared-cards/types.ts";
import { html, LitElement, nothing, type PropertyValues, unsafeCSS } from "lit";
import { styleMap } from "lit/directives/style-map.js";

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
export class RgbLightCard extends LitElement {
  static override properties = {
    _config: { state: true },
    _dragHs: { state: true },
    _briDraft: { state: true },
  };

  static override styles = [
    unsafeCSS(baseCss),
    unsafeCSS(switchCss),
    unsafeCSS(toastCss),
    unsafeCSS(cardCss),
  ];

  declare _config?: RgbLightCardConfig & { favorites: Favorite[] };
  /** Where the user is dragging on the wheel; the marker follows it instead of the light. */
  declare _dragHs: [number, number] | null;
  /** The brightness slider value while the user is using it. */
  declare _briDraft: number | null;

  private _hass?: HomeAssistant;
  private _dragging = false;
  private _lastSend = 0;
  private _dragEndTimer?: ReturnType<typeof setTimeout>;
  private _tick?: ReturnType<typeof setInterval>;
  private readonly _toast = new ToastController(this);

  constructor() {
    super();
    this._dragHs = null;
    this._briDraft = null;
  }

  static getStubConfig(hass: HomeAssistant): Partial<RgbLightCardConfig> {
    const light = Object.keys(hass?.states || {}).find(
      (id) =>
        id.startsWith("light.") &&
        ((hass.states[id]?.attributes.supported_color_modes as string[] | undefined) || []).some((m) =>
          ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(m),
        ),
    );
    return { entity: light || "light.example" };
  }

  setConfig(config: RgbLightCardConfig): void {
    if (!config?.entity) throw new Error("Set 'entity' to a color light");
    this._config = { favorites: DEFAULT_FAVORITES, ...config };
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set hass(hass: HomeAssistant) {
    const prev = this._hass;
    this._hass = hass;
    if (!this._config) return;
    const c = this._config;
    const ids = [c.entity, ...(c.switches || []).map(refId), ...(c.inputs || []).map(refId)];
    if (!prev || ids.some((id) => prev.states[id] !== hass.states[id])) this.requestUpdate();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // keeps the inputs' "5m ago" current
    this._tick = setInterval(() => this.requestUpdate(), 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._tick);
    clearTimeout(this._dragEndTimer);
  }

  getCardSize(): number {
    return 7;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  protected override updated(changed: PropertyValues): void {
    // The canvas is created once with the card, so paint it the first time it appears.
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>("canvas");
    if (canvas && !canvas.dataset.painted) {
      drawWheel(canvas);
      canvas.dataset.painted = "1";
    }
    super.updated(changed);
  }

  /* --------------------------------------------------------- actions */

  private get _st(): EntityState | undefined {
    return this._config ? this._hass?.states[this._config.entity] : undefined;
  }

  private get _modes(): string[] {
    return (this._st?.attributes?.supported_color_modes as string[] | undefined) || [];
  }

  private _turnOn(data: Record<string, unknown>): Promise<unknown> | undefined {
    if (!this._hass || !this._config) return;
    return this._hass
      .callService("light", "turn_on", { entity_id: this._config.entity, ...data })
      .catch((e: unknown) => this._toast.show((e as Error)?.message || "That didn't work"));
  }

  private _setColor(rgb: Rgb): void {
    if (this._modes.includes("rgbw")) void this._turnOn({ rgbw_color: [...rgb, 0] });
    else if (this._modes.includes("rgbww")) void this._turnOn({ rgbww_color: [...rgb, 0, 0] });
    else void this._turnOn({ rgb_color: rgb });
  }

  private _setWhite(): void {
    const modes = this._modes;
    if (modes.includes("rgbw")) void this._turnOn({ rgbw_color: [0, 0, 0, 255] });
    else if (modes.includes("rgbww")) void this._turnOn({ rgbww_color: [0, 0, 0, 255, 255] });
    else if (modes.includes("white")) void this._turnOn({ white: this._st?.attributes?.brightness || 255 });
    else void this._turnOn({ rgb_color: [255, 255, 255] });
  }

  private _toggle(e: Event): void {
    e.stopPropagation();
    if (this._hass && this._config)
      void this._hass.callService("light", "toggle", { entity_id: this._config.entity });
  }

  private _pick(ev: PointerEvent, final: boolean): void {
    const [h, s] = pointerHs(ev, ev.currentTarget as HTMLElement);
    this._dragHs = [h, s];
    const now = Date.now();
    if (final || now - this._lastSend > DRAG_SEND_MS) {
      this._lastSend = now;
      this._setColor(hsToRgb(h, s));
    }
  }

  private _onPointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    clearTimeout(this._dragEndTimer);
    try {
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    } catch {
      // capture not available – dragging still works inside the wheel
    }
    this._dragging = true;
    this._pick(ev, false);
  }

  private _onPointerMove(ev: PointerEvent): void {
    if (this._dragging) this._pick(ev, false);
  }

  private _onPointerUp(ev: PointerEvent): void {
    if (!this._dragging) return;
    this._dragging = false;
    this._pick(ev, true);
    // Hold the marker where it was dropped until the light reports its new colour.
    this._dragEndTimer = setTimeout(() => {
      this._dragHs = null;
    }, 1500);
  }

  private _onFavorite(f: Favorite): void {
    if (isWhiteFavorite(f)) this._setWhite();
    else this._setColor(hexToRgb(f.color) || [255, 255, 255]);
  }

  private _onBrightness(ev: Event): void {
    this._briDraft = Number((ev.target as HTMLInputElement).value);
  }

  private _onBrightnessChange(ev: Event): void {
    void this._turnOn({ brightness_pct: Number((ev.target as HTMLInputElement).value) });
  }

  /* ---------------------------------------------------------- render */

  override render(): unknown {
    const h = this._hass;
    const c = this._config;
    if (!h || !c) return nothing;
    const st = this._st;
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
          ? ["On", pct != null ? `${pct}%` : null, effect, isWhite ? "White" : null]
              .filter(Boolean)
              .join(" · ")
          : "Off";

    const [mh, ms] = this._dragHs ?? (on && hs && !isWhite ? hs : [0, 0]);
    const current: Rgb | "white" | null = on
      ? isWhite
        ? "white"
        : ((a.rgb_color as Rgb | undefined) ?? null)
      : null;

    const hidden = new Set((c.hide_effects || []).map((x) => String(x).toLowerCase()));
    const effects = ((a.effect_list as string[] | undefined) || []).filter(
      (e) => e && !hidden.has(String(e).toLowerCase()),
    );
    const bri = this._briDraft ?? pct ?? 0;

    return html`
      <ha-card
        class=${!st || unavailable ? "unavailable" : on ? "on" : "off"}
        style=${styleMap({ "--light": `rgb(${rgb.join(",")})` })}
      >
        <div class="top">
          <button class="icon-btn" aria-label="Toggle" @click=${this._toggle}>
            <ha-icon .icon=${c.icon || (a.icon as string | undefined) || "mdi:led-strip-variant"}></ha-icon>
          </button>
          <div
            class="info"
            role="button"
            tabindex="0"
            @click=${() => fireMoreInfo(this, c.entity)}
            @keydown=${(e: KeyboardEvent) => e.key === "Enter" && fireMoreInfo(this, c.entity)}
          >
            <div class="name">${c.name || a.friendly_name || c.entity}</div>
            <div class="sub">${sub}</div>
          </div>
          <button
            class="switch big ${on ? "on" : ""}"
            aria-label="Toggle"
            ?disabled=${unavailable}
            @click=${this._toggle}
          >
            <span></span>
          </button>
        </div>

        <div class="picker">
          <div
            class="wheel-wrap"
            @pointerdown=${this._onPointerDown}
            @pointermove=${this._onPointerMove}
            @pointerup=${this._onPointerUp}
            @pointercancel=${() => (this._dragging = false)}
          >
            <canvas width="400" height="400" aria-label="Color wheel"></canvas>
            <div
              class="marker"
              ?hidden=${!on}
              style=${styleMap({ ...markerPosition(mh, ms), background: `rgb(${hsToRgb(mh, ms).join(",")})` })}
            ></div>
          </div>
        </div>

        <div class="bri">
          <ha-icon icon="mdi:brightness-6"></ha-icon>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            aria-label="Brightness"
            .value=${String(bri)}
            ?disabled=${unavailable}
            @input=${this._onBrightness}
            @change=${this._onBrightnessChange}
            @blur=${() => (this._briDraft = null)}
          />
          <span class="val"
            >${this._briDraft != null ? `${this._briDraft}%` : pct != null ? `${pct}%` : "–"}</span
          >
        </div>

        <div class="favs">
          ${c.favorites.map(
            (f) =>
              html`<button
                class="fav ${favoriteMatches(f, current) ? "active" : ""}"
                title=${f.name}
                aria-label=${f.name}
                style=${styleMap({ "--c": `rgb(${favoriteRgb(f).join(",")})` })}
                @click=${() => this._onFavorite(f)}
              ></button>`,
          )}
        </div>

        ${
          effects.length
            ? html`<div class="effects">
                <span class="lbl">Effect</span>
                ${effects.map(
                  (e) =>
                    html`<button
                      class="chip ${on && a.effect === e ? "on" : ""}"
                      @click=${() => this._turnOn({ effect: e })}
                    >
                      ${e[0]!.toUpperCase() + e.slice(1)}
                    </button>`,
                )}
              </div>`
            : nothing
        }
        ${c.switches?.length ? html`<div class="extras">${c.switches.map((s) => this._renderSwitch(s))}</div>` : nothing}
        ${
          c.inputs?.length
            ? html`<div class="subhead">Inputs</div>
                <div class="inputs">${c.inputs.map((s, i) => this._renderInput(s, i))}</div>`
            : nothing
        }
        ${this._toast.render()}
      </ha-card>
    `;
  }

  private _renderSwitch(ref: EntityRef): unknown {
    const id = refId(ref);
    const s = this._hass!.states[id];
    const icon = (typeof ref === "object" && ref.icon) || "mdi:shimmer";
    return html`<div class="row">
      <ha-icon .icon=${icon}></ha-icon>
      <span class="row-name" @click=${() => fireMoreInfo(this, id)}>
        ${refName(ref) || s?.attributes?.friendly_name || id}
      </span>
      <button
        class="switch ${s?.state === "on" ? "on" : ""}"
        aria-label="Toggle"
        ?disabled=${!s || s.state === "unavailable"}
        @click=${() => this._hass?.callService("homeassistant", "toggle", { entity_id: id })}
      >
        <span></span>
      </button>
    </div>`;
  }

  private _renderInput(ref: EntityRef, i: number): unknown {
    const id = refId(ref);
    const s = this._hass!.states[id];
    const type = s?.attributes?.event_type as string | undefined;
    // An event entity's state is the time of its last event.
    const when = s && !isUnavailable(s) ? s.state : null;
    const recent = !!when && Date.now() - Date.parse(when) < 60_000;
    return html`<button class="input ${recent ? "recent" : ""}" @click=${() => fireMoreInfo(this, id)}>
      <span class="in-name">${refName(ref) || `Input ${i + 1}`}</span>
      <span class="in-last">
        ${when ? `${(type && EVENT_LABELS[type]) || type || "Pressed"} · ${relTime(when)}` : "No presses yet"}
      </span>
    </button>`;
  }
}
