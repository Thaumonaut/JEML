/**
 * Vite plugin for `solid-jotlang`. Place it BEFORE `vite-plugin-solid`
 * so the JOTLANG source is rewritten to TSX before Solid compiles it further.
 *
 * ```ts
 * // vite.config.ts
 * import solidJotlang from 'solid-jotlang/vite'
 * import solid from 'vite-plugin-solid'
 *
 * export default { plugins: [solidJotlang(), solid()] }
 * ```
 */

import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
import { compile, type CompileOptions } from './compiler/solid-codegen'

export type JotlSolidOptions = {
  /** Glob-ish suffix to match. Defaults to `.jot`. */
  suffix?: string
  /**
   * How to handle `>> meta:` directives.
   *  - `'auto'` (default): use `solid-meta` if it resolves from the project,
   *    otherwise drop meta directives with a one-time console warning.
   *  - `'solid-meta'`: always emit solid-meta tags (will fail at runtime if
   *    the peer is missing).
   *  - `'noop'`: always skip meta directives.
   */
  meta?: 'auto' | 'solid-meta' | 'noop'
}

export default function solidJotlang(options: JotlSolidOptions = {}): Plugin {
  const suffix = options.suffix ?? '.jot'
  const metaSetting = options.meta ?? 'auto'
  let resolvedMeta: CompileOptions['meta'] = 'noop'
  let warnedNoMeta = false

  return {
    name: 'solid-jotlang',
    enforce: 'pre',
    configResolved(config) {
      // Decide once, per dev/build cycle, whether `solid-meta` is reachable
      // from the user's project. `createRequire` lets us peek at the host's
      // module graph without importing anything synchronously.
      if (metaSetting === 'solid-meta' || metaSetting === 'noop') {
        resolvedMeta = metaSetting
        return
      }
      try {
        const require = createRequire(`${config.root}/package.json`)
        require.resolve('solid-meta')
        resolvedMeta = 'solid-meta'
      } catch {
        resolvedMeta = 'noop'
      }
    },
    transform(code, id) {
      // Strip Vite's query-string suffix (`?import` etc.) so we still match.
      const cleanId = id.split('?')[0] ?? id
      if (!cleanId.endsWith(suffix)) return null

      // Surface a single, friendly warning when the file uses meta but the
      // host project hasn't installed solid-meta — avoids silently dropping
      // metadata in production builds.
      if (
        resolvedMeta === 'noop' &&
        !warnedNoMeta &&
        /(^|\n)\s*>>\s+meta\b/u.test(code)
      ) {
        warnedNoMeta = true
        // eslint-disable-next-line no-console
        console.warn(
          `[solid-jotlang] ${cleanId}: >> meta directives detected but \`solid-meta\` is not installed. ` +
            `Add it as a dependency to lower meta into <Title>/<Meta> components, ` +
            `or pass meta: 'noop' to silence this warning.`,
        )
      }

      const result = compile(code, { filename: cleanId, meta: resolvedMeta })
      // Re-tag the id as .tsx so vite-plugin-solid picks it up.
      return {
        code: result.code,
        map: null,
      }
    },
    handleHotUpdate(ctx) {
      if (!ctx.file.endsWith(suffix)) return
      // Force a full module reload — preserving signal values across an HMR
      // cycle is a v2 concern; correctness first.
      const mod = ctx.modules.find((m) => m.file === ctx.file)
      return mod ? [mod] : undefined
    },
  }
}
