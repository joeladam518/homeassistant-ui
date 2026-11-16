import { act } from "preact/test-utils";

export { act };

/** For tests: let Preact finish pending renders and effects. */
export function flush(): Promise<void> {
  return act(async () => {});
}
