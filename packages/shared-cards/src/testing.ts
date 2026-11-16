import { act } from "preact/test-utils";

/** For tests: let Preact finish pending renders and effects. */
export function flush(): Promise<void> {
  return act(async () => {});
}
