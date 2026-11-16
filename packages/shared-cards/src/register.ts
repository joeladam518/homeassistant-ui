import type { CustomCardEntry } from "./types.ts";

/** Define a custom element unless another copy of this file already did. */
export function defineOnce(tag: string, element: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, element);
}

/** List the card in the dashboard's "Add card" picker. */
export function registerCard(entry: CustomCardEntry): void {
  window.customCards ??= [];
  if (!window.customCards.some((c) => c.type === entry.type)) window.customCards.push(entry);
}

/** The coloured "CARD-NAME v1.2.3" line in the browser console. */
export function logVersion(name: string, version: string, color: string): void {
  console.info(
    `%c ${name} %c v${version} `,
    `background:${color};color:#000;font-weight:700`,
    "background:#222;color:#fff",
  );
}
