import type { VNode } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

interface ToastState {
  text: string;
  /** In the DOM (it stays a moment after hiding, so it can fade out). */
  mounted: boolean;
  visible: boolean;
}

const HIDDEN: ToastState = { text: "", mounted: false, visible: false };

/**
 * A short message that slides up at the bottom of the card, then fades away.
 * Render `toast` inside the card (position: relative) and add toast.css to its styles.
 *
 * `const { show, toast } = useToast();` → `show("That didn't work")`
 */
export function useToast(duration = 3000): { show: (text: string) => void; toast: VNode } {
  const [state, setState] = useState<ToastState>(HIDDEN);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const unmountTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clear = (): void => {
    clearTimeout(hideTimer.current);
    clearTimeout(unmountTimer.current);
  };

  useEffect(() => clear, []);

  const show = useCallback(
    (text: string): void => {
      clear();
      setState({ text, mounted: true, visible: true });
      hideTimer.current = setTimeout(() => {
        setState((s) => ({ ...s, visible: false }));
        unmountTimer.current = setTimeout(() => setState(HIDDEN), 250);
      }, duration);
    },
    [duration],
  );

  const toast = (
    <div class={`toast ${state.visible ? "show" : ""}`} role="status" hidden={!state.mounted}>
      {state.text}
    </div>
  );

  return { show, toast };
}
