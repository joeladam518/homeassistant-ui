import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import postcss from "postcss";
import type { Plugin } from "rolldown";

import postcssConfig from "../postcss.config.js";

const SUFFIX = "?inline";

/**
 * `import css from "./card.css?inline"` (or from a package, e.g. `@joeladam518/shared-cards/…`) → the file run
 * through PostCSS, as a string. Same import style as Vite, so vitest and the build read CSS the same way.
 */
export function cssInline(): Plugin {
  const processor = postcss(postcssConfig.plugins);
  return {
    name: "css-inline",
    async resolveId(source, importer) {
      if (!source.endsWith(`.css${SUFFIX}`) || !importer) return null;
      const bare = source.slice(0, -SUFFIX.length);
      if (bare.startsWith(".")) return resolve(dirname(importer), bare) + SUFFIX;
      // a package path, e.g. @joeladam518/shared-cards/switch.css
      const found = await this.resolve(bare, importer, { skipSelf: true });
      return found ? found.id + SUFFIX : null;
    },
    async load(id) {
      if (!id.endsWith(`.css${SUFFIX}`)) return null;
      const file = id.slice(0, -SUFFIX.length);
      this.addWatchFile(file);
      const result = await processor.process(await readFile(file, "utf8"), { from: file });
      return { code: `export default ${JSON.stringify(result.css)};`, moduleType: "js" };
    },
  };
}
