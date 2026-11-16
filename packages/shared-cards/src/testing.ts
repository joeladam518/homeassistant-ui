import { act } from "preact/test-utils";

export { act };

/** For tests: let Preact finish pending renders and effects. */
export function flush(): Promise<void> {
  return act(async () => {});
}

/**
 * For tests: define bare stand-ins for HA's own elements, with the properties the cards set.
 * In HA these elements exist, so Preact sets properties on them (not attributes); this makes
 * tests behave the same way.
 */
export function stubHaElements(): void {
  const stubs: Record<string, string[]> = {
    "ha-icon": ["icon"],
    "ha-state-icon": ["hass", "stateObj", "icon"],
    "ha-form": ["hass", "data", "schema", "computeLabel"],
  };

  for (const [tag, props] of Object.entries(stubs)) {
    if (customElements.get(tag)) {
      continue;
    }

    class Stub extends HTMLElement {}
    for (const prop of props) {
      Object.defineProperty(Stub.prototype, prop, { value: undefined, writable: true });
    }
    customElements.define(tag, Stub);
  }
}
