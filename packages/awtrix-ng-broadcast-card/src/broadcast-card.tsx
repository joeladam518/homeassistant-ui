import {
  discoverPrefixes,
  publish,
  subscribeTopic,
  type Unsubscribe,
} from "@joeladam518/shared-awtrix/mqtt.ts";
import {
  buildNotify,
  DEFAULT_DURATION_MS,
  DURATIONS,
  loadRecent,
  type RecentMessage,
  saveRecent,
} from "@joeladam518/shared-awtrix/notify.ts";
import { type CardProps, createCardElement } from "@joeladam518/shared-cards/card-element.tsx";
import { lsGet, lsSet } from "@joeladam518/shared-cards/storage.ts";
import { useToast } from "@joeladam518/shared-cards/toast.tsx";
import type { HomeAssistant, LovelaceCardConfig } from "@joeladam518/shared-cards/types.ts";
import type { FunctionComponent as FC } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import broadcastCss from "./broadcast.css?inline";
import commonCss from "@joeladam518/shared-awtrix/common.css?inline";
import toastCss from "@joeladam518/shared-cards/toast.css?inline";

type ClockRef = string | { prefix: string; name?: string };

export interface AwtrixNgBroadcastCardConfig extends LovelaceCardConfig {
  title?: string;
  /** The clocks to offer; defaults to every clock found. */
  clocks?: ClockRef[];
}

type Config = AwtrixNgBroadcastCardConfig & { title: string };

interface Clock {
  prefix: string;
  name: string;
}

interface SavedForm {
  targets?: string[];
  color?: string;
  icon?: string;
  rainbow?: boolean;
  sound?: boolean;
}

/** The form's state, for one set of clocks. */
interface FormState {
  key: string;
  saved: SavedForm;
  targets: Set<string>;
  rainbow: boolean;
  recent: RecentMessage[];
}

function clockList(c: Config, hass: HomeAssistant): Clock[] {
  const list = c.clocks?.length ? c.clocks : discoverPrefixes(hass);
  return list.map((x) =>
    typeof x === "string" ? { prefix: x, name: x } : { prefix: x.prefix, name: x.name ?? x.prefix },
  );
}

/** Restores the picked clocks and the message style from last time. */
function loadForm(key: string, clocks: Clock[]): FormState {
  const saved = lsGet<SavedForm>(key, {});
  return {
    key,
    saved,
    targets: new Set(saved.targets?.length ? saved.targets : clocks.map((c) => c.prefix)),
    rainbow: !!saved.rainbow,
    recent: loadRecent(`${key}:recent`),
  };
}

function stopAll(unsubs: Unsubscribe[]): void {
  for (const unsub of unsubs) {
    try {
      unsub();
    } catch {
      // gone
    }
  }
}

/** One message box that sends to several AWTRIX NG clocks at once. */
export const AwtrixNgBroadcastCard: FC<CardProps<Config>> = ({ config: c, hass }) => {
  const clocks = clockList(c, hass);
  const prefixes = clocks.map((x) => x.prefix).join(",");
  /** localStorage key; one per set of clocks, so two broadcast cards don't share a form. */
  const key = `awtrix-ng-card:broadcast:${prefixes}`;

  const [stored, setStored] = useState<FormState | null>(null);
  const form = stored?.key === key ? stored : loadForm(key, clocks);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const { show: showToast, toast } = useToast();

  const textRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const durRef = useRef<HTMLSelectElement>(null);
  const soundRef = useRef<HTMLInputElement>(null);

  // Live online/offline status. A non-admin can't listen: no status then, but sending still works.
  useEffect(() => {
    if (!hass.connection) {
      return;
    }

    let stopped = false;
    let unsubs: Unsubscribe[] = [];
    void Promise.allSettled(
      clocks.map((x) =>
        subscribeTopic(hass, `${x.prefix}/availability`, (m) => {
          setOnline((o) => ({ ...o, [x.prefix]: m.payload === "online" }));
        }),
      ),
    ).then((results) => {
      unsubs = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (stopped) {
        stopAll(unsubs);
      }
    });

    return () => {
      stopped = true;
      stopAll(unsubs);
    };
  }, [prefixes]);

  const selected = (targets = form.targets): Clock[] => clocks.filter((x) => targets.has(x.prefix));

  /** Updates the form and saves it with the inputs' current values. */
  const update = (changes: Partial<FormState>): void => {
    const next = { ...form, ...changes };
    setStored(next);
    lsSet(key, {
      targets: [...next.targets],
      color: colorRef.current?.value,
      icon: iconRef.current?.value.trim(),
      rainbow: next.rainbow,
      sound: soundRef.current?.checked,
    } satisfies SavedForm);
  };

  const toggleTarget = (prefix: string): void => {
    const targets = new Set(form.targets);
    if (targets.has(prefix)) {
      targets.delete(prefix);
    } else {
      targets.add(prefix);
    }
    update({ targets });
  };

  const pub = (prefix: string, sub: string, payload?: unknown): void => {
    void publish(hass, prefix, sub, payload).catch((e: unknown) =>
      showToast((e as Error)?.message || "Publish failed"),
    );
  };

  const send = (): void => {
    const text = textRef.current!.value.trim();
    const icon = iconRef.current!.value.trim();
    const targets = selected();
    if (!targets.length) {
      showToast("Pick at least one clock");
      return;
    }
    if (!text && !icon) {
      showToast("Type a message first");
      textRef.current!.focus();
      return;
    }

    const opts = {
      text,
      icon,
      color: colorRef.current!.value.toUpperCase(),
      rainbow: form.rainbow,
      dur: Number(durRef.current!.value),
      sound: soundRef.current!.checked,
    };
    const body = buildNotify(opts);
    for (const x of targets) {
      pub(x.prefix, "notify", body);
    }
    showToast(
      `Sent to ${targets.length === clocks.length ? "every clock" : targets.map((x) => x.name).join(", ")}`,
    );
    const recent = saveRecent(`${key}:recent`, { text, color: opts.color, icon, rainbow: opts.rainbow }, 6);
    textRef.current!.value = "";
    update({ recent });
  };

  const dismiss = (): void => {
    const targets = selected();
    for (const x of targets) {
      pub(x.prefix, "notify/dismiss", "");
    }
    showToast(
      targets.length
        ? `Dismissed on ${targets.length} clock${targets.length > 1 ? "s" : ""}`
        : "Pick at least one clock",
    );
  };

  const applyRecent = (r: RecentMessage): void => {
    textRef.current!.value = r.text;
    colorRef.current!.value = r.color || "#FFFFFF";
    iconRef.current!.value = r.icon || "";
    setStored({ ...form, rainbow: !!r.rainbow });
    textRef.current!.focus();
  };

  const saved = form.saved;

  return (
    <ha-card>
      <div class="bc-head">
        <div class="bc-title">
          <ha-icon icon="mdi:bullhorn-outline" />
          {c.title}
        </div>
        <div class="targets">
          {clocks.map((x) => {
            const on = form.targets.has(x.prefix);
            const isOnline = online[x.prefix];
            return (
              <button
                key={x.prefix}
                class={`chip-btn target ${on ? "on" : ""} ${isOnline === false ? "offline" : ""}`}
                title={isOnline === false ? "Offline" : isOnline ? "Online" : ""}
                aria-pressed={on}
                onClick={() => toggleTarget(x.prefix)}
              >
                <ha-icon icon={on ? "mdi:check-circle" : "mdi:circle-outline"} />
                {x.name}
              </button>
            );
          })}
        </div>
      </div>

      <div class="bc-row">
        <input
          ref={textRef}
          type="text"
          id="text"
          placeholder="Type a message for every selected clock…"
          maxLength={300}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button class="btn primary" onClick={send}>
          <ha-icon icon="mdi:send" />
          Send
        </button>
      </div>

      <div class="bc-opts">
        <span class="color-row">
          <input
            ref={colorRef}
            type="color"
            id="color"
            defaultValue={saved.color || "#FFFFFF"}
            aria-label="Text color"
            onChange={() => update({})}
          />
          <button
            class={`chip-btn ${form.rainbow ? "on" : ""}`}
            onClick={() => update({ rainbow: !form.rainbow })}
          >
            Rainbow
          </button>
        </span>
        <input
          ref={iconRef}
          type="text"
          id="icon"
          class="small-in"
          placeholder="Icon ID"
          defaultValue={saved.icon || ""}
          aria-label="Icon ID"
          onChange={() => update({})}
        />
        <select ref={durRef} id="dur" aria-label="Show for">
          {DURATIONS.map((d) => (
            <option key={d.ms} value={d.ms} selected={d.ms === DEFAULT_DURATION_MS}>
              {d.label}
            </option>
          ))}
        </select>
        <label class="check">
          <input
            ref={soundRef}
            type="checkbox"
            id="sound"
            defaultChecked={!!saved.sound}
            onChange={() => update({})}
          />{" "}
          Chime
        </label>
        <span class="spacer" />
        <button class="btn ghost" onClick={dismiss}>
          <ha-icon icon="mdi:bell-off-outline" />
          Dismiss all
        </button>
      </div>

      <div class="recent">
        {form.recent.length > 0 && (
          <>
            <span class="note">Recent</span>{" "}
            {form.recent.map((r, i) => (
              <button
                key={i}
                class="chip-btn"
                style={{ "--c": r.rainbow ? "var(--primary-color)" : r.color || "#FFFFFF" }}
                onClick={() => applyRecent(r)}
              >
                <span class="sw" />
                {r.text || `icon ${r.icon}`}
              </button>
            ))}
          </>
        )}
      </div>

      {toast}
    </ha-card>
  );
};

export const AwtrixNgBroadcastCardElement = createCardElement(AwtrixNgBroadcastCard, {
  styles: [toastCss, commonCss, broadcastCss],
  config: (config: AwtrixNgBroadcastCardConfig): Config => ({
    ...config,
    title: config.title ?? "Message all clocks",
  }),
  // Like before: only the first `hass` renders. The card shows no entity states, and actions only
  // need `hass.callService` and `hass.connection`, which stay the same.
  watch: () => [],
  cardSize: 4,
  gridOptions: { columns: "full", rows: "auto" },
  stubConfig: (hass) => ({ title: "Message all clocks", clocks: discoverPrefixes(hass) }),
});

export type AwtrixNgBroadcastCardElement = InstanceType<typeof AwtrixNgBroadcastCardElement>;
