import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import solidJotl from './src/vite'

// We run two test environments:
//  - Codegen tests (default `node` env, no plugins needed) — pure string in,
//    string out.
//  - Runtime tests (`jsdom` env, mounted via @solidjs/testing-library) — these
//    need vite-plugin-solid wired up so the .jot → .tsx output gets compiled
//    to real Solid JS. We register solidJotl() BEFORE solid() and tell solid()
//    to also process .jot files (since they're now TSX).
export default defineConfig({
  plugins: [
    solidJotl(),
    solid({
      // solid-jotl emits plain JS (no TS syntax) so we just need to add
      // `.jot` to the list of files vite-plugin-solid is willing to process.
      extensions: ['.jot'],
    }),
  ],
  resolve: {
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    server: {
      deps: {
        // Solid needs to run un-bundled in vitest so its reactive transform
        // applies to imported source.
        inline: [/solid-js/, /@solidjs\/testing-library/],
      },
    },
  },
})
