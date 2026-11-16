/** Open Home Assistant's more-info dialog (history, settings) for an entity. */
export function fireMoreInfo(el: HTMLElement, entityId: string | null | undefined): void {
  if (!entityId) return;
  el.dispatchEvent(
    new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }),
  );
}
