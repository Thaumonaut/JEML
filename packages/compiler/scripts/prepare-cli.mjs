/**
 * Runs during `npm install` / `npm install -g`:
 * - From a git checkout: build dist/jotl.mjs so the `jotl` bin works immediately.
 * - From the published npm tarball (no src/): no-op — prepack already shipped dist/jotl.mjs.
 */
import { existsSync } from 'node:fs'

if (!existsSync('src/cli.ts')) {
  process.exit(0)
}

await import('./bundle-styles.mjs')

const { build } = await import('esbuild')
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/jotl.mjs',
})
