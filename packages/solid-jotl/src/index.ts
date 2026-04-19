/**
 * Public entry point for `solid-jotl`.
 *
 * `compile(source, options?)` parses a `.jot` source string and returns a
 * TSX module that vite-plugin-solid can compile further. Most users won't
 * call this directly — the Vite plugin in `./vite` does it for them.
 */

export { compile, compileAst } from './compiler/solid-codegen'
export type { CompileOptions, CompileResult } from './compiler/solid-codegen'
