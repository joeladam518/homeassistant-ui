declare module "*.css?inline" {
  const css: string;
  export default css;
}

/** The package.json version, filled in at build time. */
declare const __VERSION__: string;
