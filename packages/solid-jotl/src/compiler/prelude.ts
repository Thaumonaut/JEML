/**
 * Builders for the import header that every compiled `.jot` file emits.
 *
 * We track which Solid primitives the generated body actually uses (signal,
 * effect, memo, resource, Show, Switch/Match, For) and only import what's
 * needed — the resulting TSX is then handed off to vite-plugin-solid which
 * doesn't tree-shake from the outside.
 */

export type SolidImports = {
  createSignal: boolean
  createEffect: boolean
  createMemo: boolean
  createResource: boolean
  Show: boolean
  Switch: boolean // also pulls in Match
  For: boolean
}

export function emptyImports(): SolidImports {
  return {
    createSignal: false,
    createEffect: false,
    createMemo: false,
    createResource: false,
    Show: false,
    Switch: false,
    For: false,
  }
}

/** Render the `import { ... } from 'solid-js'` line, omitting unused names. */
export function renderSolidImport(used: SolidImports): string {
  const names: string[] = []
  if (used.createSignal) names.push('createSignal')
  if (used.createEffect) names.push('createEffect')
  if (used.createMemo) names.push('createMemo')
  if (used.createResource) names.push('createResource')
  if (used.Show) names.push('Show')
  if (used.Switch) names.push('Switch', 'Match')
  if (used.For) names.push('For')
  if (names.length === 0) return ''
  return `import { ${names.join(', ')} } from 'solid-js'`
}
