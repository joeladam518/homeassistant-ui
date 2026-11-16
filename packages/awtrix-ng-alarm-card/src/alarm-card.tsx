import { type CardProps, createCardElement } from "@joeladam518/shared-cards/card-element.tsx";
import { heldValue, useNow } from "@joeladam518/shared-cards/hooks.ts";
import { useToast } from "@joeladam518/shared-cards/toast.tsx";
import type { EntityState, HomeAssistant, LovelaceCardConfig } from "@joeladam518/shared-cards/types.ts";
import type { FunctionComponent as FC } from "preact";
import { useEffect, useReducer, useRef, useState } from "preact/hooks";

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
import commonCss from "@joeladam518/shared-awtrix/common.css?inline";
import switchCss from "@joeladam518/shared-cards/switch.css?inline";
import toastCss from "@joeladam518/shared-cards/toast.css?inline";

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

type Config = typeof ALARM_DEFAULTS & AwtrixNgAlarmCardConfig;

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

function use12h(hass: HomeAssistant): boolean {
  const tf = hass.locale?.time_format;
  if (tf === "12") {
    return true;
  }
  if (tf === "24") {
    return false;
  }
  try {
    return !!new Intl.DateTimeFormat(hass.locale?.language || undefined, {
      hour: "numeric",
    }).resolvedOptions().hour12;
  } catch {
    return false;
  }
}

/**
 * Add, edit and remove alarm times (with days) and pick the alarm sound. The alarms themselves are
 * kept in Home Assistant helpers, and a Home Assistant automation rings them.
 */
export const AwtrixNgAlarmCard: FC<CardProps<Config>> = ({ config: c, hass, host }) => {
  /** The list just saved, shown until Home Assistant reports it back. */
  const [pending, setPending] = useState<Alarm[] | null>(null);
  /** The alarm whose delete button is waiting for a second tap. */
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  /** Slider values while the user is dragging them. */
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  /** Re-render without a state change, so inputs snap back to the stored value. */
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const addTime = useRef<HTMLInputElement>(null);
  const addDays = useRef<HTMLSelectElement>(null);
  const { show: showToast, toast } = useToast();

  // keeps "Next alarm" current
  useNow(30_000);

  useEffect(
    () => () => {
      clearTimeout(pendingTimer.current);
      clearTimeout(confirmTimer.current);
    },
    [],
  );

  /* ------------------------------------------------------------ helpers */

  const st = (key: EntityKey): EntityState | undefined => hass.states[c[key]];
  const alarms = pending ?? parseAlarms(st("alarms_entity")?.state);
  const twelveHour = use12h(hass);

  const timeText = (t: string): string => {
    const { time, ampm } = formatAlarmTime(t, twelveHour);
    return ampm ? `${time} ${ampm}` : time;
  };

  const call = (domain: string, service: string, data: Record<string, unknown>): void => {
    hass
      .callService(domain, service, data)
      .catch((e: unknown) => showToast((e as Error)?.message || "That didn't work"));
  };

  /** Leave a control alone while the user is using it, so incoming state never fights them. */
  const held = (key: string, value: unknown): string | undefined => heldValue(host.shadowRoot, key, value);

  /* ------------------------------------------------------------ actions */

  /** Saves the list, showing it straight away (sorted, as it will be stored). */
  const save = (list: Alarm[]): boolean => {
    const keys = list.map(alarmKey);
    if (new Set(keys).size !== keys.length) {
      showToast("That alarm already exists");
      rerender(0);
      return false;
    }

    const value = serializeAlarms(list);
    const max = Number(st("alarms_entity")?.attributes?.max ?? 255);
    if (value.length > max) {
      showToast("That's the most alarms this list can hold — remove one first");
      return false;
    }

    setPending(parseAlarms(value));
    clearTimeout(pendingTimer.current);
    hass
      .callService("input_text", "set_value", { entity_id: c.alarms_entity, value })
      .catch((e: unknown) => showToast((e as Error)?.message || "That didn't work"))
      .finally(() => {
        pendingTimer.current = setTimeout(() => setPending(null), 1500);
      });
    return true;
  };

  const add = (): void => {
    const v = addTime.current!.value;
    if (!/^\d{2}:\d{2}$/.test(v)) {
      showToast("Pick a time first");
      return;
    }
    const t = v.replace(":", "");
    const d = addDays.current!.value;
    if (alarms.some((a) => a.t === t && a.d === d)) {
      showToast("That alarm already exists");
      return;
    }
    if (save([...alarms, { t, d, on: true }])) {
      showToast(`Alarm added: ${timeText(t)}, ${daysSummary(d)}`);
    }
  };

  /** Applies `change` to a copy of one alarm and saves. */
  const edit = (key: string, change: (a: Alarm, list: Alarm[], i: number) => boolean | void): void => {
    const list = alarms.map((a) => ({ ...a }));
    const i = list.findIndex((x) => alarmKey(x) === key);
    const alarm = list[i];
    if (!alarm) {
      showToast("That alarm changed — try again");
      rerender(0);
      return;
    }
    if (change(alarm, list, i) !== false) {
      save(list);
    }
  };

  const onToggleDay = (key: string, day: string): void => {
    edit(key, (a) => {
      const days = toggleDay(a.d, day);
      if (!days) {
        showToast("An alarm needs at least one day");
        return false;
      }
      a.d = days;
    });
  };

  const onDelete = (key: string): void => {
    clearTimeout(confirmTimer.current);
    if (confirmKey !== key) {
      setConfirmKey(key);
      confirmTimer.current = setTimeout(() => setConfirmKey(null), 4000);
      return;
    }
    setConfirmKey(null);
    edit(key, (_a, list, i) => {
      list.splice(i, 1);
      showToast("Alarm removed");
    });
  };

  const onSetTime = (key: string, v: string): void => {
    if (!/^\d{2}:\d{2}$/.test(v)) {
      return;
    }
    edit(key, (a) => {
      a.t = v.replace(":", "");
    });
  };

  const stop = (): void => call("script", "turn_on", { entity_id: c.stop_script });

  /* ------------------------------------------------------------- render */

  const nextText = (): string => {
    if (st("enabled_entity")?.state === "off") {
      return "All alarms are off";
    }
    const list = alarms.filter((a) => a.on && a.d);
    if (!list.length) {
      return "No alarms set";
    }
    const next = nextAlarm(list);
    if (!next) {
      return "No upcoming alarm";
    }
    const day =
      next.daysAhead === 0
        ? "Today"
        : next.daysAhead === 1
          ? "Tomorrow"
          : DAY_LONG[(next.at.getDay() + 6) % 7];
    return `Next: ${day} ${timeText(next.alarm.t)}`;
  };

  const masterOn = st("enabled_entity")?.state !== "off";
  const sound = st("sound_entity");
  const options = (sound?.attributes?.options as string[] | undefined) || [];
  const isPhone = sound?.state === PHONE_SOUND;
  const hiddenSlider = (id: string): boolean => (id === "rep" ? !isPhone : isPhone);

  const textLine = (key: string, entity: EntityKey, label: string, placeholder: string, hidden: boolean) => (
    <div class="line" hidden={hidden}>
      <span>{label}</span>
      <input
        type="text"
        placeholder={placeholder}
        data-k={key}
        value={held(key, st(entity)?.state)}
        onChange={(e) =>
          call("input_text", "set_value", { entity_id: c[entity], value: e.currentTarget.value.trim() })
        }
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );

  return (
    <ha-card>
      <div class="head">
        <div class="title">
          <ha-icon icon="mdi:alarm" class="big-icon" />
          <div>
            <div class="name">{c.title}</div>
            <div class="sub">{nextText()}</div>
          </div>
        </div>
        <button
          class={`switch ${masterOn ? "on" : ""}`}
          aria-label="All alarms on/off"
          onClick={() =>
            call("input_boolean", st("enabled_entity")?.state === "on" ? "turn_off" : "turn_on", {
              entity_id: c.enabled_entity,
            })
          }
        >
          <span />
        </button>
      </div>

      <div class="ringing" hidden={st("ring_script")?.state !== "on"}>
        <ha-icon icon="mdi:alarm-bell" />
        <span>Alarm is ringing</span>
        <button class="btn primary" onClick={stop}>
          <ha-icon icon="mdi:stop" />
          Stop
        </button>
      </div>

      <div class={`alarms ${masterOn ? "" : "all-off"}`}>
        {alarms.length ? (
          alarms.map((a) => (
            <AlarmRow
              key={alarmKey(a)}
              alarm={a}
              confirming={confirmKey === alarmKey(a)}
              timeValue={held(`time-${alarmKey(a)}`, `${a.t.slice(0, 2)}:${a.t.slice(2)}`)}
              onSetTime={onSetTime}
              onToggleDay={onToggleDay}
              onToggle={(key) =>
                edit(key, (x) => {
                  x.on = !x.on;
                })
              }
              onDelete={onDelete}
            />
          ))
        ) : (
          <div class="empty">
            <ha-icon icon="mdi:alarm-off" />
            No alarms yet — add one below.
          </div>
        )}
      </div>

      <div class="bottom">
        <div class="panel">
          <div class="subhead">Add an alarm</div>
          <div class="add">
            <input ref={addTime} type="time" id="addTime" defaultValue="07:00" aria-label="New alarm time" />
            <select ref={addDays} id="addDays" aria-label="Days for the new alarm">
              <option value="12345">Weekdays</option>
              <option value="67">Weekends</option>
              <option value="1234567">Every day</option>
              {DAY_LONG.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}s only
                </option>
              ))}
            </select>
            <button class="btn primary" onClick={add}>
              <ha-icon icon="mdi:plus" />
              Add alarm
            </button>
          </div>
        </div>

        <div class="panel">
          <div class="subhead">Sound</div>
          <div class="line">
            <span>Sound</span>
            <select
              onChange={(e) =>
                call("input_select", "select_option", {
                  entity_id: c.sound_entity,
                  option: e.currentTarget.value,
                })
              }
            >
              {options.map((o) => (
                <option key={o} value={o} selected={o === sound?.state}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          {textLine("mp3", "mp3_entity", "MP3 address", "/local/alarms/wake.mp3", sound?.state !== MP3_SOUND)}
          {textLine("msg", "phone_message_entity", "Message", "Good morning! Time to get up!", !isPhone)}
          {SLIDERS.map((sl) => {
            const raw = st(sl.entity)?.state;
            const v = raw == null || Number.isNaN(Number(raw)) ? null : Math.round(Number(raw));
            const shown = drafts[sl.id] ?? v;
            return (
              <div key={sl.id} class="line" hidden={hiddenSlider(sl.id)}>
                <span>{sl.label}</span>
                <span class="slider">
                  <input
                    type="range"
                    min={sl.min}
                    max={sl.max}
                    step={sl.step}
                    data-k={sl.id}
                    value={held(sl.id, v)}
                    onInput={(e) => setDrafts((d) => ({ ...d, [sl.id]: Number(e.currentTarget.value) }))}
                    onChange={(e) =>
                      call("input_number", "set_value", {
                        entity_id: c[sl.entity],
                        value: Number(e.currentTarget.value),
                      })
                    }
                    onBlur={() =>
                      setDrafts((d) => {
                        const { [sl.id]: _gone, ...rest } = d;
                        return rest;
                      })
                    }
                  />
                  <span class="val">{shown != null ? `${shown}${sl.unit}` : ""}</span>
                </span>
              </div>
            );
          })}
          <div class="actions left">
            <button
              class="btn ghost"
              onClick={() => {
                call("script", "turn_on", { entity_id: c.ring_script });
                showToast("Ringing a test alarm…");
              }}
            >
              <ha-icon icon="mdi:play-circle-outline" />
              Test
            </button>
            <button class="btn ghost" onClick={stop}>
              <ha-icon icon="mdi:stop-circle-outline" />
              Stop
            </button>
            <button
              class="btn ghost"
              onClick={() => {
                call("automation", "trigger", { entity_id: c.refresh_automation, skip_condition: true });
                showToast("Checking the clock for sounds…");
              }}
            >
              <ha-icon icon="mdi:refresh" />
              Refresh sounds
            </button>
          </div>
        </div>
      </div>

      {toast}
    </ha-card>
  );
};

interface AlarmRowProps {
  alarm: Alarm;
  confirming: boolean;
  timeValue: string | undefined;
  onSetTime: (key: string, value: string) => void;
  onToggleDay: (key: string, day: string) => void;
  onToggle: (key: string) => void;
  onDelete: (key: string) => void;
}

const AlarmRow: FC<AlarmRowProps> = ({
  alarm: a,
  confirming,
  timeValue,
  onSetTime,
  onToggleDay,
  onToggle,
  onDelete,
}) => {
  const key = alarmKey(a);

  return (
    <div class={`alarm ${a.on ? "" : "off"}`}>
      <div class="when">
        <input
          type="time"
          aria-label="Alarm time"
          data-k={`time-${key}`}
          value={timeValue}
          onChange={(e) => onSetTime(key, e.currentTarget.value)}
        />
        <div class="days-sum">{daysSummary(a.d)}</div>
      </div>
      <div class="days">
        {DAY_LABELS.map((label, k) => {
          const on = a.d.includes(String(k + 1));
          return (
            <button
              key={label + k}
              class={`day ${on ? "on" : ""}`}
              aria-pressed={on}
              title={DAY_LONG[k]!}
              onClick={() => onToggleDay(key, String(k + 1))}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button class={`switch ${a.on ? "on" : ""}`} aria-label="Alarm on/off" onClick={() => onToggle(key)}>
        <span />
      </button>
      {confirming ? (
        <button class="round small del confirm" aria-label="Confirm delete" onClick={() => onDelete(key)}>
          Delete?
        </button>
      ) : (
        <button class="round small del" aria-label="Delete alarm" onClick={() => onDelete(key)}>
          <ha-icon icon="mdi:delete-outline" />
        </button>
      )}
    </div>
  );
};

export const AwtrixNgAlarmCardElement = createCardElement(AwtrixNgAlarmCard, {
  styles: [switchCss, toastCss, commonCss, alarmCss],
  config: (config: AwtrixNgAlarmCardConfig): Config => ({ ...ALARM_DEFAULTS, ...config }),
  watch: (c) => WATCHED.map((key) => c[key]),
  cardSize: 8,
  gridOptions: { columns: "full", rows: "auto" },
  stubConfig: () => ({ title: "Bedroom alarm" }),
});

export type AwtrixNgAlarmCardElement = InstanceType<typeof AwtrixNgAlarmCardElement>;
