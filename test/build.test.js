// Guards the build output itself, not just the logic: the accent colours are
// applied at runtime as `var(--color-<accent>)`, so Tailwind must emit every
// palette variable even though no utility references them at build time.
// Without `@theme static`, Tailwind tree-shakes the unreferenced ones and those
// pandas silently render colourless — see src/input.css.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ACCENTS, accentFor, PANDAS } from '../_site/src/pandas.js';

const readBuildFile = (name) => readFile(new URL(`../_site/${name}`, import.meta.url), 'utf8');

test('every accent in the palette is emitted as a CSS variable', async () => {
  const css = await readBuildFile('styles.css');

  for (const accent of ACCENTS) {
    assert.ok(
      css.includes(`--color-${accent}:`),
      `--color-${accent} is missing from the built CSS; ` +
        'does src/input.css still use `@theme static`?',
    );
  }
});

test('every panda resolves to an accent the stylesheet defines', async () => {
  const css = await readBuildFile('styles.css');

  for (const panda of PANDAS) {
    const accent = accentFor(panda);
    assert.ok(
      css.includes(`--color-${accent}:`),
      `${panda.name} uses --color-${accent}, which the built CSS does not define`,
    );
  }
});

test('the accent-forcing rules survive Tailwind and are plain CSS', async () => {
  const css = await readBuildFile('styles.css');

  // These cannot go through @apply: Tailwind drops a utility whose value comes
  // from a custom property set at runtime, with no error.
  assert.match(css, /\.pd-card\s*\{[^}]*border-color:\s*var\(--accent\)/s);
  assert.match(css, /\.pd-age,\s*\.pd-match-score b\s*\{[^}]*color:\s*var\(--accent\)/s);
  assert.match(css, /\.pd-match\s*\{[^}]*border-left-color:\s*var\(--accent\)/s);
});

test('the accent rules come after the component layer, so they win', async () => {
  const css = await readBuildFile('styles.css');

  // The grouped rule that sets the accent colour must come after the component
  // rule that would otherwise set a fixed one, or the component colour wins on
  // source order.
  const componentAge = css.search(/^\s*\.pd-age\s*\{/m);
  const accentAge = css.search(/^\s*\.pd-age,\s*\n\s*\.pd-match-score b\s*\{/m);

  assert.ok(componentAge !== -1, '.pd-age rule missing from the build');
  assert.ok(accentAge !== -1, 'the grouped accent-colour rule missing from the build');
  assert.ok(
    accentAge > componentAge,
    'the accent colour rule must come after .pd-age or the component colour wins',
  );
});

test('the page loads the built script and stylesheet', async () => {
  const html = await readBuildFile('index.html');

  assert.ok(html.includes('href="styles.css"'), 'index.html does not link styles.css');
  assert.ok(html.includes('src="src/app.js"'), 'index.html does not load the compiled src/app.js');
});

test('every pd- class used at runtime exists in the built CSS', async () => {
  const [css, app, html] = await Promise.all([
    readBuildFile('styles.css'),
    readBuildFile('src/app.js'),
    readBuildFile('index.html'),
  ]);

  const names = new Set();
  for (const source of [app, html]) {
    for (const match of source.matchAll(/['"`\s](pd-[a-z0-9-]+)/g)) names.add(match[1]);
  }
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of match[1].split(/\s+/)) {
      if (cls.startsWith('pd-')) names.add(cls);
    }
  }

  assert.ok(names.size > 20, `expected to find many classes, found ${names.size}`);
  const missing = [...names].filter((name) => !css.includes(`.${name}`));
  assert.deepEqual(missing, [], `classes used but not styled: ${missing.join(', ')}`);
});
