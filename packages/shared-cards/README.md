# @joeladam518/shared-cards

Helpers and styles shared by my Home Assistant cards, published to GitHub Packages. MIT licensed.

It ships TypeScript and CSS source, not a build. Each card bundles what it imports.

Cards are [Preact](https://preactjs.com) function components. Version 2 dropped Lit.

| File               | What it is                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `card-element.tsx` | `createCardElement` / `createEditorElement`: wrap a component in the custom element HA expects; `haProps` |
| `hooks.ts`         | `useInterval`, `useNow`, `heldValue`                                                                      |
| `toast.tsx`        | `useToast()`: a message that slides up and fades                                                          |
| `ha-elements.ts`   | JSX types for `ha-card`, `ha-icon`, `ha-form`, `ha-state-icon`                                            |
| `testing.ts`       | `act` and `flush()` for tests                                                                             |
| `register.ts`      | `defineOnce`, `registerCard` (the "Add card" picker), `logVersion`                                        |
| `types.ts`         | The Home Assistant types the cards use                                                                    |
| `format.ts`        | `relTime`, `batteryIcon`                                                                                  |
| `more-info.ts`     | `fireMoreInfo`: open HA's more-info dialog                                                                |
| `devices.ts`       | Find an entity's area and its sibling sensors                                                             |
| `statistics.ts`    | Fetch long-term statistics                                                                                |
| `sparkline.ts`     | SVG line and area paths                                                                                   |
| `storage.ts`       | `lsGet` / `lsSet`: safe localStorage JSON                                                                 |
| `*.css`            | `base.css`, `switch.css`, `toast.css`                                                                     |

## Use it in a card

1. Point the scope at GitHub Packages in the card's `.npmrc`:

   ```ini
   @joeladam518:registry=https://npm.pkg.github.com
   ```

2. Install it: `npm install @joeladam518/shared-cards`. GitHub Packages needs a token even for public packages. Locally, put a token with `read:packages` in `~/.npmrc` as `//npm.pkg.github.com/:_authToken=<token>`.
3. Install `preact` too, and set `"jsx": "react-jsx"` and `"jsxImportSource": "preact"` in `tsconfig.json`.
4. Write the card as a component, then wrap it:

   ```tsx
   import { type CardProps, createCardElement } from "@joeladam518/shared-cards/card-element.tsx";
   import { defineOnce } from "@joeladam518/shared-cards/register.ts";

   import cardCss from "./card.css?inline";

   function MyCard({ config, hass }: CardProps<MyConfig>) {
     return <ha-card>{hass.states[config.entity]?.state}</ha-card>;
   }

   defineOnce(
     "my-card",
     createCardElement(MyCard, {
       styles: [cardCss],
       watch: (c) => [c.entity],
       cardSize: 2,
     }),
   );
   ```

The `?inline` CSS imports need a CSS plugin that resolves package paths, like `tools/css-inline.ts` in this repo.

## Release

1. Bump `version` in `packages/shared-cards/package.json`.
2. Commit, then tag and push: `git tag shared-cards-v2.0.1 && git push --tags`.
3. The **Publish shared-cards** workflow checks the repo and publishes that version.
