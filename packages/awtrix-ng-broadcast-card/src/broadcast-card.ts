import {
  discoverPrefixes,
  publish,
  subscribeTopic,
  type Unsubscribe,
} from "@homeassistant-ui/shared/awtrix/mqtt.ts";
import {
  buildNotify,
  DEFAULT_DURATION_MS,
  DURATIONS,
  loadRecent,
  type RecentMessage,
  saveRecent,
} from "@homeassistant-ui/shared/awtrix/notify.ts";
import { lsGet, lsSet } from "@homeassistant-ui/shared/lib/storage.ts";
import { ToastController } from "@homeassistant-ui/shared/lib/toast.ts";
import type {
  HomeAssistant,
  LovelaceCardConfig,
  LovelaceGridOptions,
} from "@homeassistant-ui/shared/lib/types.ts";
import { html, LitElement, nothing, unsafeCSS } from "lit";
import { styleMap } from "lit/directives/style-map.js";

import broadcastCss from "./broadcast.css?inline";
import commonCss from "@homeassistant-ui/shared/awtrix/common.css?inline";
import toastCss from "@homeassistant-ui/shared/lib/toast.css?inline";

type ClockRef = string | { prefix: string; name?: string };

export interface AwtrixNgBroadcastCardConfig extends LovelaceCardConfig {
  title?: string;
  /** The clocks to offer; defaults to every clock found. */
  clocks?: ClockRef[];
}

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

/** One message box that sends to several AWTRIX NG clocks at once. */
export class AwtrixNgBroadcastCard extends LitElement {
  static override properties = {
    _config: { state: true },
    _targets: { state: true },
    _online: { state: true },
    _rainbow: { state: true },
    _recent: { state: true },
  };

  static override styles = [unsafeCSS(toastCss), unsafeCSS(commonCss), unsafeCSS(broadcastCss)];

  declare _config?: AwtrixNgBroadcastCardConfig & { title: string };
  declare _targets: Set<string>;
  declare _online: Record<string, boolean>;
  declare _rainbow: boolean;
  declare _recent: RecentMessage[];

  private _hass?: HomeAssistant;
  private _saved: SavedForm = {};
  private _loadedKey?: string;
  private _unsubs: Unsubscribe[] = [];
  private _subscribing = false;
  private readonly _toast = new ToastController(this);

  constructor() {
    super();
    this._targets = new Set();
    this._online = {};
    this._rainbow = false;
    this._recent = [];
  }

  static getStubConfig(hass: HomeAssistant): Partial<AwtrixNgBroadcastCardConfig> {
    return { title: "Message all clocks", clocks: discoverPrefixes(hass) };
  }

  setConfig(config: AwtrixNgBroadcastCardConfig): void {
    this._config = { title: "Message all clocks", ...config };
    this._loadedKey = undefined;
    this._load();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._load();
      this.requestUpdate();
      if (this.isConnected) void this._subscribe();
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this._hass) void this._subscribe();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const unsub of this._unsubs) {
      try {
        unsub();
      } catch {
        // gone
      }
    }
    this._unsubs = [];
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: "full", rows: "auto" };
  }

  private get _clocks(): Clock[] {
    const list = this._config?.clocks?.length ? this._config.clocks : discoverPrefixes(this._hass);
    return list.map((c) =>
      typeof c === "string" ? { prefix: c, name: c } : { prefix: c.prefix, name: c.name ?? c.prefix },
    );
  }

  /** localStorage key; one per set of clocks, so two broadcast cards don't share a form. */
  private get _key(): string {
    return `awtrix-ng-card:broadcast:${this._clocks.map((c) => c.prefix).join(",")}`;
  }

  /** Restores the picked clocks and the message style from last time. */
  private _load(): void {
    if (!this._config || !this._hass || this._loadedKey === this._key) return;
    this._loadedKey = this._key;
    this._saved = lsGet<SavedForm>(this._key, {});
    this._targets = new Set(
      this._saved.targets?.length ? this._saved.targets : this._clocks.map((c) => c.prefix),
    );
    this._rainbow = !!this._saved.rainbow;
    this._recent = loadRecent(`${this._key}:recent`);
  }

  private async _subscribe(): Promise<void> {
    const h = this._hass;
    if (this._unsubs.length || this._subscribing || !h?.connection) return;
    this._subscribing = true;
    const results = await Promise.allSettled(
      this._clocks.map((c) =>
        subscribeTopic(h, `${c.prefix}/availability`, (m) => {
          this._online = { ...this._online, [c.prefix]: m.payload === "online" };
        }),
      ),
    );
    // A non-admin can't listen: no live status then, but sending still works.
    this._unsubs = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    this._subscribing = false;
  }

  private _q<T extends Element = HTMLInputElement>(sel: string): T {
    return this.renderRoot.querySelector<T>(sel)!;
  }

  private _selected(): Clock[] {
    return this._clocks.filter((c) => this._targets.has(c.prefix));
  }

  private _save(): void {
    lsSet(this._key, {
      targets: [...this._targets],
      color: this._q("#color").value,
      icon: this._q("#icon").value.trim(),
      rainbow: this._rainbow,
      sound: this._q("#sound").checked,
    } satisfies SavedForm);
  }

  private _toggleTarget(prefix: string): void {
    const next = new Set(this._targets);
    if (next.has(prefix)) next.delete(prefix);
    else next.add(prefix);
    this._targets = next;
    this._save();
  }

  private _pub(prefix: string, sub: string, payload?: unknown): void {
    void publish(this._hass!, prefix, sub, payload).catch((e: unknown) =>
      this._toast.show((e as Error)?.message || "Publish failed"),
    );
  }

  private _send(): void {
    const text = this._q("#text").value.trim();
    const icon = this._q("#icon").value.trim();
    const targets = this._selected();
    if (!targets.length) {
      this._toast.show("Pick at least one clock");
      return;
    }
    if (!text && !icon) {
      this._toast.show("Type a message first");
      this._q("#text").focus();
      return;
    }
    const opts = {
      text,
      icon,
      color: this._q("#color").value.toUpperCase(),
      rainbow: this._rainbow,
      dur: Number(this._q<HTMLSelectElement>("#dur").value),
      sound: this._q("#sound").checked,
    };
    const body = buildNotify(opts);
    for (const c of targets) this._pub(c.prefix, "notify", body);
    this._toast.show(
      `Sent to ${targets.length === this._clocks.length ? "every clock" : targets.map((c) => c.name).join(", ")}`,
    );
    this._recent = saveRecent(
      `${this._key}:recent`,
      { text, color: opts.color, icon, rainbow: opts.rainbow },
      6,
    );
    this._q("#text").value = "";
    this._save();
  }

  private _dismiss(): void {
    const targets = this._selected();
    for (const c of targets) this._pub(c.prefix, "notify/dismiss", "");
    this._toast.show(
      targets.length
        ? `Dismissed on ${targets.length} clock${targets.length > 1 ? "s" : ""}`
        : "Pick at least one clock",
    );
  }

  private _useRecent(r: RecentMessage): void {
    this._q("#text").value = r.text;
    this._q("#color").value = r.color || "#FFFFFF";
    this._q("#icon").value = r.icon || "";
    this._rainbow = !!r.rainbow;
    this._q("#text").focus();
  }

  override render(): unknown {
    if (!this._config || !this._hass) return nothing;
    const saved = this._saved;
    return html`
      <ha-card>
        <div class="bc-head">
          <div class="bc-title"><ha-icon icon="mdi:bullhorn-outline"></ha-icon>${this._config.title}</div>
          <div class="targets">
            ${this._clocks.map((c) => {
              const on = this._targets.has(c.prefix);
              const online = this._online[c.prefix];
              return html`<button
                class="chip-btn target ${on ? "on" : ""} ${online === false ? "offline" : ""}"
                title=${online === false ? "Offline" : online ? "Online" : ""}
                aria-pressed=${String(on)}
                @click=${() => this._toggleTarget(c.prefix)}
              >
                <ha-icon .icon=${on ? "mdi:check-circle" : "mdi:circle-outline"}></ha-icon>${c.name}
              </button>`;
            })}
          </div>
        </div>
        <div class="bc-row">
          <input
            type="text"
            id="text"
            placeholder="Type a message for every selected clock…"
            maxlength="300"
            @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this._send()}
          />
          <button class="btn primary" @click=${this._send}><ha-icon icon="mdi:send"></ha-icon>Send</button>
        </div>
        <div class="bc-opts">
          <span class="color-row">
            <input
              type="color"
              id="color"
              value=${saved.color || "#FFFFFF"}
              aria-label="Text color"
              @change=${this._save}
            />
            <button
              class="chip-btn ${this._rainbow ? "on" : ""}"
              @click=${() => {
                this._rainbow = !this._rainbow;
                this._save();
              }}
            >
              Rainbow
            </button>
          </span>
          <input
            type="text"
            id="icon"
            class="small-in"
            placeholder="Icon ID"
            value=${saved.icon || ""}
            aria-label="Icon ID"
            @change=${this._save}
          />
          <select id="dur" aria-label="Show for">
            ${DURATIONS.map(
              (d) =>
                html`<option value=${d.ms} ?selected=${d.ms === DEFAULT_DURATION_MS}>${d.label}</option>`,
            )}
          </select>
          <label class="check"
            ><input type="checkbox" id="sound" ?checked=${!!saved.sound} @change=${this._save} /> Chime</label
          >
          <span class="spacer"></span>
          <button class="btn ghost" @click=${this._dismiss}>
            <ha-icon icon="mdi:bell-off-outline"></ha-icon>Dismiss all
          </button>
        </div>
        <div class="recent">
          ${
            this._recent.length
              ? html`<span class="note">Recent</span> ${this._recent.map(
                    (r) =>
                      html`<button
                        class="chip-btn"
                        style=${styleMap({ "--c": r.rainbow ? "var(--primary-color)" : r.color || "#FFFFFF" })}
                        @click=${() => this._useRecent(r)}
                      >
                        <span class="sw"></span>${r.text || `icon ${r.icon}`}
                      </button>`,
                  )}`
              : ""
          }
        </div>
        ${this._toast.render()}
      </ha-card>
    `;
  }
}
