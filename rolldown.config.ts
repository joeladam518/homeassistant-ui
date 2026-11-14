import { existsSync, readdirSync, readFileSync } from "node:fs";

import { defineConfig, type RolldownOptions } from "rolldown";

import { cssInline } from "./tools/css-inline.ts";

/**
 * Every package with a `src/index.ts` builds to one self-contained file, `dist/<package name>.js`,
 * ready to copy to Home Assistant's /config/www/. `packages/shared` has no index, so it's only
 * bundled into the packages that use it.
 *
 * Build one package: PKG=awtrix-ng-alarm-card npm run build
 */
const only = process.env.PKG;

const packages = readdirSync(new URL("./packages", import.meta.url))
  .filter((dir) => existsSync(new URL(`./packages/${dir}/src/index.ts`, import.meta.url)))
  .filter((dir) => !only || dir === only);

if (only && !packages.length) throw new Error(`No package "${only}" with a src/index.ts in packages/`);

export default defineConfig(
  packages.map((dir): RolldownOptions => {
    const pkg = JSON.parse(
      readFileSync(new URL(`./packages/${dir}/package.json`, import.meta.url), "utf8"),
    ) as {
      name: string;
      version: string;
    };
    return {
      input: `packages/${dir}/src/index.ts`,
      output: { file: `dist/${pkg.name}.js`, format: "es", minify: true },
      transform: { define: { __VERSION__: JSON.stringify(pkg.version) } },
      plugins: [cssInline()],
    };
  }),
);
