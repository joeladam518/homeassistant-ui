import { type ComponentType, render } from "preact";

export { haProps } from "./ha-elements.ts";
import type { HomeAssistant, LovelaceCardConfig, LovelaceGridOptions } from "./types.ts";

/** What every card component gets. */
export interface CardProps<C extends LovelaceCardConfig> {
  config: C;
  hass: HomeAssistant;
  /** The card's custom element, e.g. for `fireMoreInfo(host, id)`. */
  host: HTMLElement;
}

export interface CardOptions<C extends LovelaceCardConfig, P extends LovelaceCardConfig = C> {
  /** CSS strings (`?inline` imports), applied in order. */
  styles: string[];
  /** Check the YAML config and fill in defaults. Throw to show an error in the dashboard. */
  config?: (config: C) => P;
  /**
   * The entities the card shows. A new `hass` only re-renders the card when one of these changes.
   * Leave it out to re-render on every `hass` update.
   */
  watch?: (config: P, hass: HomeAssistant) => (string | null | undefined)[];
  /** Height in rows of 50px, for the masonry layout. */
  cardSize: number;
  /** Size in the sections layout. */
  gridOptions?: LovelaceGridOptions;
  /** The config used when the card is added from the "Add card" picker. */
  stubConfig?: (hass: HomeAssistant) => Partial<C>;
  /** Tag of the visual editor element, if the card has one. */
  editor?: string;
}

/** The custom element that `createCardElement` makes. */
export interface CardElement<C extends LovelaceCardConfig> extends HTMLElement {
  setConfig(config: C): void;
  hass: HomeAssistant | undefined;
  getCardSize(): number;
  getGridOptions(): LovelaceGridOptions | undefined;
}

/** One stylesheet per card type, shared by every instance. */
export function styleSheet(styles: string[]): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles.join("\n"));
  return sheet;
}

/** True when any of `ids` has a different state object in `next` than in `prev`. */
export function statesChanged(
  prev: HomeAssistant,
  next: HomeAssistant,
  ids: (string | null | undefined)[],
): boolean {
  return ids.some((id) => id && prev.states[id] !== next.states[id]);
}

/**
 * Wraps a Preact card component in the custom element Home Assistant expects:
 * `setConfig`, a `hass` property, `getCardSize`, `getGridOptions` and the static picker hooks.
 *
 * The component renders into the element's shadow root once it has both a config and `hass`,
 * and unmounts when the element leaves the page, so effect cleanups (timers) run.
 */
export function createCardElement<C extends LovelaceCardConfig, P extends LovelaceCardConfig = C>(
  Card: ComponentType<CardProps<P>>,
  options: CardOptions<C, P>,
): (new () => CardElement<C>) & { getStubConfig(hass: HomeAssistant): Partial<C> } {
  let sheet: CSSStyleSheet | undefined;

  return class extends HTMLElement implements CardElement<C> {
    static getStubConfig(hass: HomeAssistant): Partial<C> {
      return options.stubConfig?.(hass) ?? {};
    }

    static getConfigElement(): HTMLElement | undefined {
      return options.editor ? document.createElement(options.editor) : undefined;
    }

    private _config?: P;
    private _hass?: HomeAssistant;
    private readonly _root: ShadowRoot;

    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      sheet ??= styleSheet(options.styles);
      this._root.adoptedStyleSheets = [sheet];
    }

    setConfig(config: C): void {
      this._config = options.config ? options.config({ ...config }) : ({ ...config } as unknown as P);
      this._render();
    }

    get hass(): HomeAssistant | undefined {
      return this._hass;
    }

    set hass(hass: HomeAssistant) {
      const prev = this._hass;
      this._hass = hass;
      const c = this._config;
      if (!prev || !c || !options.watch || statesChanged(prev, hass, options.watch(c, hass))) {
        this._render();
      }
    }

    connectedCallback(): void {
      this._render();
    }

    disconnectedCallback(): void {
      // HA sometimes moves a card (disconnect, then connect straight away). Only unmount if it stays out.
      queueMicrotask(() => {
        if (!this.isConnected) {
          render(null, this._root);
        }
      });
    }

    getCardSize(): number {
      return options.cardSize;
    }

    getGridOptions(): LovelaceGridOptions | undefined {
      return options.gridOptions;
    }

    private _render(): void {
      if (!this.isConnected || !this._config || !this._hass) {
        return;
      }

      render(<Card config={this._config} hass={this._hass} host={this} />, this._root);
    }
  };
}

/** What every editor component gets. */
export interface EditorProps<C extends LovelaceCardConfig> {
  config: C;
  hass: HomeAssistant;
  /** Report a changed config to the dashboard. */
  onChange: (config: C) => void;
}

/** The custom element that `createEditorElement` makes. */
export interface EditorElement<C extends LovelaceCardConfig> extends HTMLElement {
  setConfig(config: C): void;
  hass: HomeAssistant | undefined;
}

/** Wraps a Preact editor component in the custom element HA's card settings dialog expects. */
export function createEditorElement<C extends LovelaceCardConfig>(
  Editor: ComponentType<EditorProps<C>>,
  styles: string[] = [],
): new () => EditorElement<C> {
  let sheet: CSSStyleSheet | undefined;

  return class extends HTMLElement implements EditorElement<C> {
    private _config?: C;
    private _hass?: HomeAssistant;
    private readonly _root: ShadowRoot;

    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      sheet ??= styleSheet(styles);
      this._root.adoptedStyleSheets = [sheet];
    }

    setConfig(config: C): void {
      this._config = { ...config };
      this._render();
    }

    get hass(): HomeAssistant | undefined {
      return this._hass;
    }

    set hass(hass: HomeAssistant) {
      this._hass = hass;
      this._render();
    }

    connectedCallback(): void {
      this._render();
    }

    disconnectedCallback(): void {
      queueMicrotask(() => {
        if (!this.isConnected) {
          render(null, this._root);
        }
      });
    }

    private readonly _onChange = (config: C): void => {
      this._config = config;
      this.dispatchEvent(
        new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
      );
      this._render();
    };

    private _render(): void {
      if (!this.isConnected || !this._config || !this._hass) {
        return;
      }

      render(<Editor config={this._config} hass={this._hass} onChange={this._onChange} />, this._root);
    }
  };
}
