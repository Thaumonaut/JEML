/**
 * Tiny runtime helpers consumed by solid-jotlang output. Anything that's
 * non-trivial to inline at every call site lives here so the generated
 * TSX stays readable.
 *
 * IMPORTANT: this module is intentionally lean — every export adds bytes to
 * the user's bundle. Add new helpers only when they save more than they cost.
 */

/**
 * Inject a CSS string into `document.head` exactly once per call site, keyed
 * on the `id` argument. Generated code calls this from a top-level expression
 * the first time a component using a file-level `>> style:` block mounts.
 *
 * SSR-safe: the function is a no-op when `document` is undefined.
 */
export function ensureGlobalStyle(id: string, css: string): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.setAttribute('data-jotl-style', '1')
  el.textContent = css
  document.head.appendChild(el)
}
