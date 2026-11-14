# homeassistant-ui

**My private Home Assistant frontend bits**: cards I use myself and don't publish. Anything worth sharing gets its own public `homeassistant-*` repo instead, since the Marketplace allows one item per repo.

## Packages

| Package                                                          | Builds                             | `type:`                           | Version |
| ---------------------------------------------------------------- | ---------------------------------- | --------------------------------- | ------- |
| [`awtrix-ng-alarm-card`](packages/awtrix-ng-alarm-card/)         | `dist/awtrix-ng-alarm-card.js`     | `custom:awtrix-ng-alarm-card`     | 1.0.0   |
| [`awtrix-ng-broadcast-card`](packages/awtrix-ng-broadcast-card/) | `dist/awtrix-ng-broadcast-card.js` | `custom:awtrix-ng-broadcast-card` | 1.0.0   |
| [`shared`](packages/shared/)                                     | nothing; bundled into the others   |                                   |         |

## Develop

Needs Node 22+. Everything runs from the root.

```sh
npm install
npm run build                              # every package → dist/<package>.js
PKG=awtrix-ng-alarm-card npm run build     # just one
npm run watch                              # rebuild on every change
npm run check                              # typecheck, lint, format check, build, tests
npm run fmt                                # format everything
```

- **Code:** TypeScript + [Lit](https://lit.dev), styles in `*.css` (PostCSS), built with [rolldown](https://rolldown.rs). Each card is one self-contained file with Lit included.
- **Shared code** lives in `packages/shared` and is imported as `@homeassistant-ui/shared/<path>`, e.g. `@homeassistant-ui/shared/lib/toast.ts`. Its `lib/` matches the `src/lib/` in the public card repos.
- **No CI.** Builds are local, when needed.

## Deploy a card

1. `npm run build`
2. Copy `dist/<package>.js` to `/config/www/` (File editor works).
3. Bump `?v=` on the resource (**Settings → Dashboards → ⋮ → Resources**) to the package's version, then hard-refresh.

## Add a package

1. Create `packages/<name>/` with a `package.json` (`name`, `version`, `"private": true`, and dependencies on `lit` and `@homeassistant-ui/shared`).
2. Add `src/index.ts`, which defines the element(s) and calls `registerCard` and `logVersion(…, __VERSION__, …)`.
3. Run `npm install`. The build, typecheck, lint and tests pick it up automatically.
