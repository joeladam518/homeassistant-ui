import { defineConfig } from "vitest/config";

export default defineConfig({
  // The build fills in each package's own version; tests just need a value.
  define: { __VERSION__: JSON.stringify("0.0.0-test") },
  test: {
    environment: "happy-dom",
    include: ["packages/*/src/**/*.test.ts", "test/**/*.test.ts"],
    // Process `?inline` CSS imports with postcss.config.js, as the build does.
    css: true,
  },
});
