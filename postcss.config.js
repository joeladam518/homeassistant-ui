import cssnano from "cssnano";
import nesting from "postcss-nesting";

/** Used by the rolldown build (build/css-inline.ts) and by vitest. */
export default {
  plugins: [nesting(), cssnano({ preset: "default" })],
};
