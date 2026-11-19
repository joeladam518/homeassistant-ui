# homeassistant-ui

**My Home Assistant frontend bits that aren't on the Marketplace**: cards I use myself, plus the helpers shared with my public `homeassistant-*` card repos.

The repo is public so the shared helpers can be. Only `shared-cards` is licensed for reuse, though; see [License](#license).

## Packages

| Package                                                          | What it is                                    | Builds / publishes                             | Version |
| ---------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- | ------- |
| [`awtrix-ng-alarm-card`](packages/awtrix-ng-alarm-card/)         | Card, `type: custom:awtrix-ng-alarm-card`     | `dist/awtrix-ng-alarm-card.js`                 | 1.1.0   |
| [`awtrix-ng-broadcast-card`](packages/awtrix-ng-broadcast-card/) | Card, `type: custom:awtrix-ng-broadcast-card` | `dist/awtrix-ng-broadcast-card.js`             | 1.1.0   |
| [`rgb-light-card`](packages/rgb-light-card/)                     | Card, `type: custom:rgb-light-card`           | `dist/rgb-light-card.js`                       | 2.3.0   |
| [`shared-cards`](packages/shared-cards/)                         | Helpers for every card, here and public       | `@joeladam518/shared-cards` on GitHub Packages | 2.0.0   |
| [`shared-awtrix`](packages/shared-awtrix/)                       | AWTRIX helpers for the AWTRIX cards here      | nothing; bundled into the cards                |         |

## Develop

Needs Node 22+. Everything runs from the root.

```sh
npm install
npm run build                              # every card → dist/<package>.js
PKG=rgb-light-card npm run build           # just one
npm run watch                              # rebuild on every change
npm run check                              # typecheck, lint, format check, build, tests
npm run fmt                                # format everything
```

- **Code:** TypeScript + [Preact](https://preactjs.com) function components (`.tsx`), styles in `*.css` (PostCSS), built with [rolldown](https://rolldown.rs). Each card is one self-contained file with Preact included. `createCardElement` from `shared-cards` wraps a component in the custom element HA loads.
- **Shared code** is imported by file, e.g. `@joeladam518/shared-cards/toast.ts` or `@joeladam518/shared-awtrix/mqtt.ts`. Here they're workspace links, so changes show up straight away.
- **CI** only publishes `shared-cards` (see its [README](packages/shared-cards/README.md#release)). Card builds are local.

## Deploy a card

1. `npm run build`
2. Copy `dist/<package>.js` to `/config/www/` (File editor works).
3. Bump `?v=` on the resource (**Settings → Dashboards → ⋮ → Resources**) to the package's version, then hard-refresh.

## Add a card

1. Create `packages/<name>/` with a `package.json`: `name`, `version`, `"private": true`, `"license": "UNLICENSED"`, and dependencies on `preact` and `@joeladam518/shared-cards`.
2. Add the card component in `src/card.tsx`, and `src/index.ts`, which defines the element(s) with `createCardElement` and calls `registerCard` and `logVersion(…, __VERSION__, …)`.
3. Run `npm install`. The build, typecheck, lint and tests pick it up automatically.

## License

- **`packages/shared-cards`:** MIT. See its [LICENSE](packages/shared-cards/LICENSE).
- **Everything else:** all rights reserved (`UNLICENSED`). It's public to read, not to reuse.
