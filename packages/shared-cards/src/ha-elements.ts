import type { HTMLAttributes } from "preact";

/** Home Assistant's own elements, so they type-check in JSX. */
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "ha-card": HTMLAttributes<HTMLElement>;
      "ha-icon": HTMLAttributes<HTMLElement> & { icon?: string };
      "ha-state-icon": HTMLAttributes<HTMLElement>;
      "ha-form": HTMLAttributes<HTMLElement> & { "onvalue-changed"?: (e: CustomEvent) => void };
    }
  }
}

/**
 * A `ref` that sets properties (not attributes) on an element, for HA elements that take objects:
 * `<ha-form ref={haProps({ hass, data, schema })} />`.
 *
 * Preact only sets a property when the element already has it, which isn't true until HA has
 * loaded that element. This sets them either way.
 */
export function haProps(props: Record<string, unknown>): (el: HTMLElement | null) => void {
  return (el) => {
    if (el) {
      Object.assign(el, props);
    }
  };
}
