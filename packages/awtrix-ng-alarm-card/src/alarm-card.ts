import { ToastController } from "@homeassistant-ui/shared/lib/toast.ts";
import type {
  EntityState,
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceGridOptions,
} from "@homeassistant-ui/shared/lib/types.ts";
import { html, LitElement, noChange, nothing, unsafeCSS } from "lit";
import { live } from "lit/directives/live.js";

import {
  type Alarm,
  alarmKey,
  DAY_LABELS,
  DAY_LONG,
  daysSummary,
  formatAlarmTime,
  nextAlarm,
  parseAlarms,
  serializeAlarms,
  toggleDay,
} from "./alarms.ts";

import alarmCss from "./alarm.css?inline";
import commonCss from "@homeassistant-ui/shared/awtrix/common.css?inline";
import switchCss from "@homeassistant-ui/shared/lib/switch.css?inline";
import toastCss from "@homeassistant-ui/shared/lib/toast.css?inline";

/** The Home Assistant helpers, scripts and automation the alarm card works with. */
export const ALARM_DEFAULTS = {
  title: "Alarm",
  alarms_entity: "input_text.tc002_alarms",
  enabled_entity: "input_boolean.tc002_alarms_enabled",
  sound_entity: "input_select.tc002_alarm_sound",
  volume_entity: "input_number.tc002_alarm_volume",
  ring_time_entity: "input_number.tc002_alarm_ring_time",
  mp3_entity: "input_text.tc002_alarm_mp3",
  phone_message_entity: "input_text.tc002_alarm_phone_message",
  phone_repeat_entity: "input_number.tc002_alarm_phone_repeat",
  ring_script: "script.tc002_ring_alarm",
  stop_script: "script.tc002_stop_alarm",
  refresh_automation: "automation.tc002_refresh_alarm_sounds",
};

type EntityKey = Exclude<keyof typeof ALARM_DEFAULTS, "title">;

export type AwtrixNgAlarmCardConfig = LovelaceCardConfig & Partial<typeof ALARM_DEFAULTS>;

const PHONE_SOUND = "Phone: spoken message";
const MP3_SOUND = "MP3 from URL";
/** Entities whose changes re-render the card. */
const WATCHED: EntityKey[] = [
  "alarms_entity",
  "enabled_entity",
  "sound_entity",
  "volume_entity",
  "ring_time_entity",
  "mp3_entity",
  "phone_message_entity",
  "phone_repeat_entity",
  "ring_script",
];
/** "Repeat for" is for the phone message; "Volume" and "Ring for" for every other sound. */
const SLIDERS = [
  { id: "rep", entity: "phone_repeat_entity", unit: " min", label: "Repeat for", min: 1, max: 10, step: 1 },
  { id: "vol", entity: "volume_entity", unit: "%", label: "Volume", min: 0, max: 100, step: 5 },
  { id: "ring", entity: "ring_time_entity", unit: " min", label: "Ring for", min: 1, max: 30, step: 1 },
] as const;

/**
 * Add, edit and remove alarm times (with days) and pick the alarm sound. The alarms themselves are
 * kept in Home Assistant helpers, and a Home Assistant automation rings them.
 */
export class AwtrixNgAlarmCard extends LitElement {
  static override properties = {
    _config: { state: true },
    _pending: { state: true },
    _confirmKey: { state: true },
    _drafts: { state: true },
  };

  static override styles = [
    unsafeCSS(switchCss),
    unsafeCSS(toastCss),
    unsafeCSS(commonCss),
    unsafeCSS(alarmCss),
  ];

  declare _config?: typeof ALARM_DEFAULTS & AwtrixNgAlarmCardConfig;
  /** The list just saved, shown until Home Assistant reports it back. */
  declare _pending: Alarm[] | null;
  /** The alarm whose delete button is waiting for a second tap. */
  declare _confirmKey: string | null;
  declare _drafts: Record<string, number>;

  private _hass?: HomeAssistant;
  private _sig?: string;
  private _tick?: ReturnType<typeof setInterval>;
  private _pendingTimer?: ReturnType<typeof setTimeout>;
  private _confirmTimer?: ReturnType<typeof setTimeout>;
  private readonly _toast = new ToastController(this);

  constructor() {
    super();
    this._pending = null;
    this._confirmKey = null;
    this._drafts = {};
  }

  static getStubConfig(): Partial<AwtrixNgAlarmCardConfig> {
    return { title: "Bedroom alarm" };
  }

  setConfig(config: AwtrixNgAlarmCardConfig): void {
    this._config = { ...ALARM_DEFAULTS, ...config };
    this._sig = undefined;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    const sig = WATCHED.map((key) => {
      const s = hass.states[c[key]];
      return s ? `${s.state}|${((s.attributes.options as string[] | undefined) || []).join(";")}` : "-";
    }).join("#");
    if (sig !== this._sig) {
      this._sig = sig;
      this.requestUpdate();
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // keeps "Next alarm" current
    this._tick = setInterval(() => this.requestUpdate(), 30_000);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._tick);
    clearTimeout(this._pendingTimer);
    clearTimeout(this._confirmTimer);
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  /* ------------------------------------------------------------ helpers */

  private _st(key: EntityKey): EntityState | undefined {
    return this._config ? this._hass?.states[this._config[key]] : undefined;
  }

  private get _alarms(): Alarm[] {
    return this._pending ?? parseAlarms(this._st("alarms_entity")?.state);
  }

  private get _use12h(): boolean {
    const tf = this._hass?.locale?.time_format;
    if (tf === "12") return true;
    if (tf === "24") return false;
    try {
      return !!new Intl.DateTimeFormat(this._hass?.locale?.language || undefined, {
        hour: "numeric",
      }).resolvedOptions().hour12;
    } catch {
      return false;
    }
  }

  private _timeText(t: string): string {
    const { time, ampm } = formatAlarmTime(t, this._use12h);
    return ampm ? `${time} ${ampm}` : time;
  }

  private _call(domain: string, service: string, data: Record<string, unknown>): void {
    void this._hass
      ?.callService(domain, service, data)
      .catch((e: unknown) => this._toast.show((e as Error)?.message || "That didn't work"));
  }

  /** Leave a control alone while the user is using it, so incoming state never fights them. */
  private _held(key: string, value: unknown): unknown {
    const focused = this.renderRoot?.querySelector?.(":focus") as HTMLElement | null;
    if (value == null || focused?.dataset?.k === key) return noChange;
    return live(String(value));
  }

  /* ------------------------------------------------------------ actions */

  /** Saves the list, showing it straight away (sorted, as it will be stored). */
  private _save(list: Alarm[]): boolean {
    const keys = list.map(alarmKey);
    if (new Set(keys).size !== keys.length) {
      this._toast.show("That alarm already exists");
      this.requestUpdate();
      return false;
    }
    const value = serializeAlarms(list);
    const max = Number(this._st("alarms_entity")?.attributes?.max ?? 255);
    if (value.length > max) {
      this._toast.show("That's the most alarms this list can hold — remove one first");
      return false;
    }
    this._pending = parseAlarms(value);
    clearTimeout(this._pendingTimer);
    void this._hass
      ?.callService("input_text", "set_value", { entity_id: this._config!.alarms_entity, value })
      .catch((e: unknown) => this._toast.show((e as Error)?.message || "That didn't work"))
      .finally(() => {
        this._pendingTimer = setTimeout(() => {
          this._pending = null;
        }, 1500);
      });
    return true;
  }

  private _add(): void {
    const v = this.renderRoot.querySelector<HTMLInputElement>("#addTime")!.value;
    if (!/^\d{2}:\d{2}$/.test(v)) {
      this._toast.show("Pick a time first");
      return;
    }
    const t = v.replace(":", "");
    const d = this.renderRoot.querySelector<HTMLSelectElement>("#addDays")!.value;
    const list = this._alarms;
    if (list.some((a) => a.t === t && a.d === d)) {
      this._toast.show("That alarm already exists");
      return;
    }
    if (this._save([...list, { t, d, on: true }])) {
      this._toast.show(`Alarm added: ${this._timeText(t)}, ${daysSummary(d)}`);
    }
  }

  /** Applies `change` to a copy of one alarm and saves. */
  private _edit(key: string, change: (a: Alarm, list: Alarm[], i: number) => boolean | void): void {
    const list = this._alarms.map((a) => ({ ...a }));
    const i = list.findIndex((x) => alarmKey(x) === key);
    const alarm = list[i];
    if (!alarm) {
      this._toast.show("That alarm changed — try again");
      this.requestUpdate();
      return;
    }
    if (change(alarm, list, i) !== false) this._save(list);
  }

  private _toggleDay(key: string, day: string): void {
    this._edit(key, (a) => {
      const days = toggleDay(a.d, day);
      if (!days) {
        this._toast.show("An alarm needs at least one day");
        return false;
      }
      a.d = days;
    });
  }

  private _delete(key: string): void {
    if (this._confirmKey !== key) {
      this._confirmKey = key;
      clearTimeout(this._confirmTimer);
      this._confirmTimer = setTimeout(() => {
        this._confirmKey = null;
      }, 4000);
      return;
    }
    this._confirmKey = null;
    clearTimeout(this._confirmTimer);
    this._edit(key, (_a, list, i) => {
      list.splice(i, 1);
      this._toast.show("Alarm removed");
    });
  }

  private _setTime(key: string, ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    this._edit(key, (a) => {
      a.t = v.replace(":", "");
    });
  }

  private _stop = (): void => {
    this._call("script", "turn_on", { entity_id: this._config!.stop_script });
  };

  /* ------------------------------------------------------------- render */

  private _nextText(): string {
    if (this._st("enabled_entity")?.state === "off") return "All alarms are off";
    const list = this._alarms.filter((a) => a.on && a.d);
    if (!list.length) return "No alarms set";
    const next = nextAlarm(list);
    if (!next) return "No upcoming alarm";
    const day =
      next.daysAhead === 0
        ? "Today"
        : next.daysAhead === 1
          ? "Tomorrow"
          : DAY_LONG[(next.at.getDay() + 6) % 7];
    return `Next: ${day} ${this._timeText(next.alarm.t)}`;
  }

  private _renderAlarm(a: Alarm): unknown {
    const key = alarmKey(a);
    return html`<div class="alarm ${a.on ? "" : "off"}">
      <div class="when">
        <input
          type="time"
          aria-label="Alarm time"
          data-k=${`time-${key}`}
          .value=${this._held(`time-${key}`, `${a.t.slice(0, 2)}:${a.t.slice(2)}`)}
          @change=${(e: Event) => this._setTime(key, e)}
        />
        <div class="days-sum">${daysSummary(a.d)}</div>
      </div>
      <div class="days">
        ${DAY_LABELS.map((label, k) => {
          const on = a.d.includes(String(k + 1));
          return html`<button
            class="day ${on ? "on" : ""}"
            aria-pressed=${String(on)}
            title=${DAY_LONG[k]!}
            @click=${() => this._toggleDay(key, String(k + 1))}
          >
            ${label}
          </button>`;
        })}
      </div>
      <button
        class="switch ${a.on ? "on" : ""}"
        aria-label="Alarm on/off"
        @click=${() =>
          this._edit(key, (x) => {
            x.on = !x.on;
          })}
      >
        <span></span>
      </button>
      ${
        this._confirmKey === key
          ? html`<button
              class="round small del confirm"
              aria-label="Confirm delete"
              @click=${() => this._delete(key)}
            >
              Delete?
            </button>`
          : html`<button class="round small del" aria-label="Delete alarm" @click=${() => this._delete(key)}>
              <ha-icon icon="mdi:delete-outline"></ha-icon>
            </button>`
      }
    </div>`;
  }

  override render(): unknown {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const list = this._alarms;
    const masterOn = this._st("enabled_entity")?.state !== "off";
    const sound = this._st("sound_entity");
    const options = (sound?.attributes?.options as string[] | undefined) || [];
    const isPhone = sound?.state === PHONE_SOUND;
    const hiddenSlider = (id: string) => (id === "rep" ? !isPhone : isPhone);

    return html`
      <ha-card>
        <div class="head">
          <div class="title">
            <ha-icon icon="mdi:alarm" class="big-icon"></ha-icon>
            <div>
              <div class="name">${c.title}</div>
              <div class="sub">${this._nextText()}</div>
            </div>
          </div>
          <button
            class="switch ${masterOn ? "on" : ""}"
            aria-label="All alarms on/off"
            @click=${() =>
              this._call(
                "input_boolean",
                this._st("enabled_entity")?.state === "on" ? "turn_off" : "turn_on",
                {
                  entity_id: c.enabled_entity,
                },
              )}
          >
            <span></span>
          </button>
        </div>

        <div class="ringing" ?hidden=${this._st("ring_script")?.state !== "on"}>
          <ha-icon icon="mdi:alarm-bell"></ha-icon><span>Alarm is ringing</span>
          <button class="btn primary" @click=${this._stop}><ha-icon icon="mdi:stop"></ha-icon>Stop</button>
        </div>

        <div class="alarms ${masterOn ? "" : "all-off"}">
          ${
            list.length
              ? list.map((a) => this._renderAlarm(a))
              : html`<div class="empty">
                  <ha-icon icon="mdi:alarm-off"></ha-icon>No alarms yet — add one below.
                </div>`
          }
        </div>

        <div class="bottom">
          <div class="panel">
            <div class="subhead">Add an alarm</div>
            <div class="add">
              <input type="time" id="addTime" value="07:00" aria-label="New alarm time" />
              <select id="addDays" aria-label="Days for the new alarm">
                <option value="12345">Weekdays</option>
                <option value="67">Weekends</option>
                <option value="1234567">Every day</option>
                ${DAY_LONG.map((d, i) => html`<option value=${i + 1}>${d}s only</option>`)}
              </select>
              <button class="btn primary" @click=${this._add}>
                <ha-icon icon="mdi:plus"></ha-icon>Add alarm
              </button>
            </div>
          </div>

          <div class="panel">
            <div class="subhead">Sound</div>
            <div class="line">
              <span>Sound</span>
              <select
                @change=${(e: Event) =>
                  this._call("input_select", "select_option", {
                    entity_id: c.sound_entity,
                    option: (e.target as HTMLSelectElement).value,
                  })}
              >
                ${options.map((o) => html`<option value=${o} ?selected=${o === sound?.state}>${o}</option>`)}
              </select>
            </div>
            ${this._renderText("mp3", "mp3_entity", "MP3 address", "/local/alarms/wake.mp3", sound?.state !== MP3_SOUND)}
            ${this._renderText("msg", "phone_message_entity", "Message", "Good morning! Time to get up!", !isPhone)}
            ${SLIDERS.map((sl) => {
              const raw = this._st(sl.entity)?.state;
              const v = raw == null || Number.isNaN(Number(raw)) ? null : Math.round(Number(raw));
              const shown = this._drafts[sl.id] ?? v;
              return html`<div class="line" ?hidden=${hiddenSlider(sl.id)}>
                <span>${sl.label}</span>
                <span class="slider">
                  <input
                    type="range"
                    min=${sl.min}
                    max=${sl.max}
                    step=${sl.step}
                    data-k=${sl.id}
                    .value=${this._held(sl.id, v)}
                    @input=${(e: Event) =>
                      (this._drafts = {
                        ...this._drafts,
                        [sl.id]: Number((e.target as HTMLInputElement).value),
                      })}
                    @change=${(e: Event) =>
                      this._call("input_number", "set_value", {
                        entity_id: c[sl.entity],
                        value: Number((e.target as HTMLInputElement).value),
                      })}
                    @blur=${() => {
                      const { [sl.id]: _gone, ...rest } = this._drafts;
                      this._drafts = rest;
                    }}
                  />
                  <span class="val">${shown != null ? `${shown}${sl.unit}` : ""}</span>
                </span>
              </div>`;
            })}
            <div class="actions left">
              <button
                class="btn ghost"
                @click=${() => {
                  this._call("script", "turn_on", { entity_id: c.ring_script });
                  this._toast.show("Ringing a test alarm…");
                }}
              >
                <ha-icon icon="mdi:play-circle-outline"></ha-icon>Test
              </button>
              <button class="btn ghost" @click=${this._stop}>
                <ha-icon icon="mdi:stop-circle-outline"></ha-icon>Stop
              </button>
              <button
                class="btn ghost"
                @click=${() => {
                  this._call("automation", "trigger", {
                    entity_id: c.refresh_automation,
                    skip_condition: true,
                  });
                  this._toast.show("Checking the clock for sounds…");
                }}
              >
                <ha-icon icon="mdi:refresh"></ha-icon>Refresh sounds
              </button>
            </div>
          </div>
        </div>
        ${this._toast.render()}
      </ha-card>
    `;
  }

  private _renderText(
    key: string,
    entity: EntityKey,
    label: string,
    placeholder: string,
    hidden: boolean,
  ): unknown {
    const c = this._config!;
    return html`<div class="line" ?hidden=${hidden}>
      <span>${label}</span>
      <input
        type="text"
        placeholder=${placeholder}
        data-k=${key}
        .value=${this._held(key, this._st(entity)?.state)}
        @change=${(e: Event) =>
          this._call("input_text", "set_value", {
            entity_id: c[entity],
            value: (e.target as HTMLInputElement).value.trim(),
          })}
        @keydown=${(e: KeyboardEvent) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </div>`;
  }
}
