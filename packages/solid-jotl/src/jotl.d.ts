/**
 * Ambient module declaration so TypeScript can resolve `import X from 'foo.jot'`
 * to a Solid component. The solid-jotl Vite plugin handles the actual
 * compilation; this file only exists so editors and `tsc` stop complaining.
 */
declare module '*.jot' {
  import type { Component } from 'solid-js'
  const component: Component<any>
  export default component
}
