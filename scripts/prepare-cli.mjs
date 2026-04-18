/**
 * Runs during `npm install` / `npm install -g`:
 * - From a git checkout: build dist/jeml.mjs so the `jeml` bin works immediately.
 * - From the published npm tarball (no src/): no-op — prepack already shipped dist/jeml.mjs.
 */
import { existsSync } from 'node:fs'

if (!existsSync('src/cli.ts')) {
  process.exit(0)
}

const { build } = await import('esbuild')
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/jeml.mjs',
})
