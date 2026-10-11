# 🐼 Panda Tinder

A swipe-to-match dating site where every profile is a panda. Written in TypeScript, styled with Tailwind CSS, built with SWC, linted and formatted with Biome.

[![Deploy to GitHub Pages](https://github.com/vymalo/panda-tinder/actions/workflows/pages.yml/badge.svg)](https://github.com/vymalo/panda-tinder/actions/workflows/pages.yml)

![The swipe deck](docs/1-swipe.png)

## What it does

- **Swipe view** — one panda at a time with emoji art, name, age, location, a tagline, a bio and hashtagged interests. Swipe right (♥) to like, left (✕) to pass, using the buttons, your keyboard (<kbd>→</kbd> / <kbd>←</kbd>), or by dragging the card. Dragging fades in a LIKE/NOPE stamp that tilts as you pull.
- **Matches view** — everyone you liked, ranked by how well you'd actually get on, with a match percentage. A badge on the tab keeps count.
- **8 pandas** with names like Bamboo Bae, Kung Fu Ling, Mister Nap and Nutmeg (who insists she's a red panda).
- **Per-panda accent colours** — the card border, art band, age, interest chips, match row and score all derive from one accent per panda.
- Progress is saved in `localStorage`, so a reload keeps your place. **Reset the deck** reshuffles and starts over.

| Swiping right | Matches |
| --- | --- |
| ![Dragging a card right, LIKE stamp](docs/2-drag-like.png) | ![Ranked matches](docs/5-matches.png) |

<p align="center">
  <img src="docs/7-mobile.png" width="300" alt="Mobile layout">
</p>

## Run it

```bash
npm start        # then open http://localhost:3000
```

Or just open `index.html` directly — it is entirely client-side, so no server is needed.

## Run it

```bash
npm install
npm run build    # SWC + Tailwind, writes _site/
npm start        # then open http://localhost:3000
```

`npm run build` is required — `index.html` loads compiled JavaScript and generated CSS. There is no dev server; rebuild after a change.

## Check it

```bash
npm run ci       # lint, type-check, test, build — what the workflow runs
```

Or the pieces individually:

| Command | What it does |
| --- | --- |
| `npm run lint` | Biome checks and formats `src`, `test`, `scripts` and the configs |
| `npm run lint:fix` | The same, applying safe fixes |
| `npm run typecheck` | `tsc --noEmit` over `src/**/*.ts` |
| `npm test` | 19 tests against the compiled output |
| `npm run build` | SWC strips types, PostCSS runs Tailwind |

`npm test` runs the build first via a `pretest` hook, because the tests import the compiled `_site/src/pandas.js` — the code that actually ships, not the TypeScript source.

## How it works

`src/pandas.ts` holds the roster and all the logic — match scoring, a seeded shuffle and the swipe state machine — with **no DOM and no storage access**. That separation is what makes it directly testable. `src/app.ts` does rendering, gestures and persistence.

### Match score

`matchScore(a, b)` is the Jaccard overlap of two pandas' likes, minus a penalty for a wide age gap, scaled to 0–100. It is deterministic and symmetric: pandas who both love bamboo and napping score high, and a 3-year-old and a 23-year-old with identical interests score lower.

```ts
matchScore(a, b) === matchScore(b, a)   // always
matchScore(p, p) >= matchScore(p, any)  // a panda matches itself highest
```

### Accents

Accents live on the panda as data, with an `accentFor()` helper that falls back to a stable colour hashed from the id — so a panda added without an accent still gets one rather than rendering colourless. The palette keys are `mint`, `violet`, `sky`, `amber`, `coral`, `teal`, `lime` and `pink`.

The palette is declared once in `@theme static` in `src/input.css`, which makes each colour available both as a Tailwind utility (`bg-mint`) and as a CSS variable (`--color-mint`). At runtime JavaScript sets a single `--accent` per card, and the border, art band, age, chips, match row and score all read from it.

**`static` is load-bearing.** Because the accent is applied at runtime as `var(--color-<accent>)`, no utility references those colours at build time — so a plain `@theme` tree-shakes most of them away, and those pandas render colourless with no error. `test/build.test.js` asserts that every accent in the palette, and every accent a panda actually uses, is present in the built CSS.

Those accent rules are written as **plain CSS, not `@apply`**. Tailwind cannot apply a utility whose value comes from a custom property set at runtime — it silently drops the rule, which is exactly the failure this codebase hit during the Tailwind migration. If you add an accent-dependent style, write it as plain CSS with `var(--accent)`, and check it appears in the emitted `_site/styles.css`.

The styling uses modern CSS: `color-mix()` inside `@supports` fallbacks, so on an older browser the tints drop out but layout and borders survive.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The two views, markup only |
| `src/input.css` | The Tailwind theme, component classes and the accent rules |
| `src/pandas.ts` | Roster + logic: match score, seeded shuffle, swipe state machine |
| `src/app.ts` | Rendering, drag/keyboard swiping, storage |
| `scripts/build.mjs` | The build: SWC for the scripts, PostCSS for the styles |
| `scripts/serve.mjs` | Tiny static server for the build output |
| `test/pandas.test.js` | 19 unit tests |
| `tsconfig.json` | Strict TypeScript config, `noEmit` |
| `biome.json` | Biome lint and format rules |
| `docs/` | Screenshots |

### Toolchain

| Tool | Version | Role |
| --- | --- | --- |
| TypeScript | 7.0.2 | Types, and `tsc --noEmit` for checking |
| SWC | 1.16.18 | Strips the types; does not type-check |
| Tailwind CSS | 4.3.3 | Utility CSS via `@tailwindcss/postcss` |
| Biome | 2.5.15 | Lint and format, replacing ESLint and Prettier |

**SWC does not type-check.** It transpiles and discards the type information, so a type error is invisible to it. That is why `npm run typecheck` runs separately, and why `npm run ci` runs it *before* the build. Never rely on the build alone to catch a type error.

These are development dependencies. The built site ships as three static files and has no runtime dependencies at all.

## Deploying

The site is live at **https://vymalo.github.io/panda-tinder**.

`.github/workflows/pages.yml` publishes it on every push to `main`. Enable it once under **Settings → Pages → Source: GitHub Actions**.

The workflow installs dependencies, runs Biome, `tsc --noEmit`, the tests and the build, then uploads `_site/` as the Pages artifact. Nothing is published unless every earlier step passes.

Pages on a **private** repository requires a paid plan; this repository is public, so it is free. The build output could equally be hosted anywhere that serves static files.

### Workflow action versions

The pins in the workflow were checked against the upstream releases rather than assumed:

| Action | Pinned | Latest |
| --- | --- | --- |
| `actions/checkout` | `v7` | v7.0.1 |
| `actions/setup-node` | `v7` | v7.1.0 |
| `actions/configure-pages` | `v6` | v6.0.0 |
| `actions/upload-pages-artifact` | `v5` | v5.0.0 |
| `actions/deploy-pages` | `v5` | v5.0.1 |

These are moving major tags, so a patch release is picked up automatically. `configure-pages` is not used: the workflow does not need its output, since the artifact path is fixed and the deploy action handles the rest.

`node-version` is pinned to `'26'`. Node 26 became LTS on **28 October 2026** under Node's newer one-release-a-year schedule, with support through April 2029. It supersedes Node 24, whose active support ended **20 October 2026** — 24 remains in maintenance (security fixes) until 30 April 2028, so bumping back is a one-line change if you ever need to.
