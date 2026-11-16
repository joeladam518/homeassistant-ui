# @joeladam518/shared-cards

Helpers and styles shared by my Home Assistant cards, published to GitHub Packages. MIT licensed.

It ships TypeScript and CSS source, not a build. Each card bundles what it imports.

| File            | What it is                                                         |
| --------------- | ------------------------------------------------------------------ |
| `register.ts`   | `defineOnce`, `registerCard` (the "Add card" picker), `logVersion` |
| `types.ts`      | The Home Assistant types the cards use                             |
| `format.ts`     | `relTime`, `batteryIcon`                                           |
| `more-info.ts`  | `fireMoreInfo`: open HA's more-info dialog                         |
| `devices.ts`    | Find an entity's area and its sibling sensors                      |
| `statistics.ts` | Fetch long-term statistics                                         |
| `sparkline.ts`  | SVG line and area paths                                            |
| `storage.ts`    | `lsGet` / `lsSet`: safe localStorage JSON                          |
| `toast.ts`      | `ToastController` (Lit)                                            |
| `*.css`         | `base.css`, `switch.css`, `toast.css`                              |

## Use it in a card

1. Point the scope at GitHub Packages in the card's `.npmrc`:

   ```ini
   @joeladam518:registry=https://npm.pkg.github.com
   ```

2. Install it: `npm install @joeladam518/shared-cards`. GitHub Packages needs a token even for public packages. Locally, put a token with `read:packages` in `~/.npmrc` as `//npm.pkg.github.com/:_authToken=<token>`.
3. Import by file:

   ```ts
   import { defineOnce, registerCard } from "@joeladam518/shared-cards/register.ts";

   import switchCss from "@joeladam518/shared-cards/switch.css?inline";
   ```

The `?inline` CSS imports need a CSS plugin that resolves package paths, like `tools/css-inline.ts` in this repo.

## Release

1. Bump `version` in `packages/shared-cards/package.json`.
2. Commit, then tag and push: `git tag shared-cards-v1.0.1 && git push --tags`.
3. The **Publish shared-cards** workflow checks the repo and publishes that version.
