// Build: SWC strips the types from src/*.ts into _site/src/*.js, PostCSS runs
// Tailwind over src/input.css into _site/styles.css, and the static files are
// copied across. Types are checked separately by `tsc --noEmit` — SWC does not
// check them, which is why `npm run ci` runs typecheck before build.

import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformFile } from '@swc/core';
import tailwind from '@tailwindcss/postcss';
import postcss from 'postcss';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, '_site');
const srcDir = join(root, 'src');

const SWC_OPTIONS = {
  jsc: {
    parser: { syntax: 'typescript', decorators: false },
    target: 'es2022',
    // Keep the files as ES modules; the browser loads them with <script type="module">.
    externalHelpers: false,
  },
  module: { type: 'es6' },
  sourceMaps: false,
  minify: false,
};

/** Compile every .ts under src/ to .js, preserving the directory shape. */
async function buildScripts() {
  const entries = await readdir(srcDir, { withFileTypes: true });
  const compiled = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;

    const from = join(srcDir, entry.name);
    const to = join(outDir, 'src', entry.name.replace(/\.ts$/, '.js'));

    const { code } = await transformFile(from, SWC_OPTIONS);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, code, 'utf8');
    compiled.push(entry.name);
  }

  return compiled;
}

/** Run Tailwind over the input stylesheet. */
async function buildStyles() {
  const input = join(srcDir, 'input.css');
  const css = await readFile(input, 'utf8');
  const result = await postcss([tailwind()]).process(css, { from: input });

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'styles.css'), result.css, 'utf8');

  return result.css.length;
}

/** Copy the files that need no processing. */
async function copyStatic() {
  const copied = [];
  for (const name of ['index.html']) {
    await copyFile(join(root, name), join(outDir, name));
    copied.push(name);
  }
  return copied;
}

async function build() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const [scripts, cssBytes, staticFiles] = await Promise.all([
    buildScripts(),
    buildStyles(),
    copyStatic(),
  ]);

  console.log(`compiled ${scripts.length} TypeScript file(s): ${scripts.join(', ')}`);
  console.log(`styles.css: ${cssBytes} bytes`);
  console.log(`copied: ${staticFiles.join(', ')}`);
  console.log(`build written to ${outDir}`);
}

build().catch((error) => {
  console.error('build failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
