// Shared helper — the same file is copied into each homeassistant-* card repo. Keep the copies identical.
import { html, type ReactiveController, type ReactiveControllerHost, type TemplateResult } from "lit";

/**
 * A short message that slides up at the bottom of the card, then fades away.
 * Put `${this.toast.render()}` inside the card (position: relative) and add toast.css to its styles.
 */
export class ToastController implements ReactiveController {
  text = "";
  /** In the DOM (it stays a moment after hiding, so it can fade out). */
  mounted = false;
  visible = false;

  private _hideTimer?: ReturnType<typeof setTimeout>;
  private _unmountTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly duration = 3000,
  ) {
    host.addController(this);
  }

  show(text: string): void {
    clearTimeout(this._hideTimer);
    clearTimeout(this._unmountTimer);
    this.text = text;
    this.mounted = true;
    this.visible = true;
    this.host.requestUpdate();
    this._hideTimer = setTimeout(() => {
      this.visible = false;
      this.host.requestUpdate();
      this._unmountTimer = setTimeout(() => {
        this.mounted = false;
        this.host.requestUpdate();
      }, 250);
    }, this.duration);
  }

  hostDisconnected(): void {
    clearTimeout(this._hideTimer);
    clearTimeout(this._unmountTimer);
    this.mounted = this.visible = false;
  }

  render(): TemplateResult {
    return html`<div class="toast ${this.visible ? "show" : ""}" role="status" ?hidden=${!this.mounted}>
      ${this.text}
    </div>`;
  }
}
