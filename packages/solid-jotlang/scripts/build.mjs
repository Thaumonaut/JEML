#!/usr/bin/env node
/**
 * Build script for solid-jotlang.
 *
 * Mirrors the esbuild approach used by jotlang: bundle the published
 * surface (`src/index.ts` and `src/vite.ts`) into ESM modules under `dist/`,
 * keeping the SolidJS runtime out of the package (it's a peer dep).
 *
 * The companion `tsc -p tsconfig.build.json` invocation in the npm script
 * emits the .d.ts files that ride alongside the bundles.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const shared = {
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  // We re-export jotl from `index.ts`, but the consumer should resolve
  // it through their own node_modules (it's a hard dep). Same for solid-js
  // (peer) and vite (optional peer used by `vite.ts` only).
  external: ['jotl', 'solid-js', 'solid-js/*', 'vite', 'node:*'],
  logLevel: 'info',
}

await Promise.all([
  build({
    ...shared,
    entryPoints: [resolve(root, 'src/index.ts')],
    outfile: resolve(root, 'dist/index.js'),
  }),
  build({
    ...shared,
    entryPoints: [resolve(root, 'src/vite.ts')],
    outfile: resolve(root, 'dist/vite.js'),
  }),
  build({
    ...shared,
    entryPoints: [resolve(root, 'src/runtime/helpers.ts')],
    outfile: resolve(root, 'dist/runtime/helpers.js'),
  }),
])
