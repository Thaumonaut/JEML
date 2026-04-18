import type { Attribute } from './ast'

/**
 * Parse the inside of `[ ... ]` per RULEBOOK §8.3–8.6:
 * quoted/unquoted values, bare flags, and `^(bp)=val` / `attr^(bp)=val` overrides.
 */
export function parseAttributes(raw: string): Attribute[] {
  const attrs: Attribute[] = []
  let i = 0
  const s = raw
  const len = s.length

  const skipWs = (): void => {
    while (i < len && /\s/u.test(s[i]!)) i++
  }

  const readIdent = (): string => {
    const start = i
    if (i >= len || !/[a-zA-Z_]/.test(s[i]!)) return ''
    i++
    while (i < len && /[\w-]/.test(s[i]!)) i++
    return s.slice(start, i)
  }

  const readQuoted = (): string => {
    const q = s[i]
    if (q !== '"' && q !== "'") return ''
    i++
    const start = i
    while (i < len && s[i] !== q) {
      if (s[i] === '\\') i++
      i++
    }
    const v = s.slice(start, i)
    if (i < len) i++
    return v
  }

  const readUnquotedValue = (): string => {
    const start = i
    while (i < len) {
      const c = s[i]!
      if (/\s/u.test(c)) break
      if (c === ']') break
      if (c === '^' && s[i + 1] === '(') break
      i++
    }
    return s.slice(start, i)
  }

  /** After `^`, parse `(bp)` and return bp string; `i` must be at `^`. */
  const readParenBreakpoint = (): string => {
    if (s[i] !== '^' || s[i + 1] !== '(') return ''
    i += 2
    const start = i
    while (i < len && s[i] !== ')') i++
    const bp = s.slice(start, i)
    if (i < len) i++
    return bp
  }

  while (true) {
    skipWs()
    if (i >= len || s[i] === ']') break

    if (s[i] === '^' && s[i + 1] === '(') {
      const bp = readParenBreakpoint()
      if (i < len && s[i] === '=') {
        i++
        const val = readUnquotedValue()
        const last = attrs[attrs.length - 1]
        if (last) {
          if (!last.overrides) last.overrides = []
          last.overrides.push({ breakpoint: bp, value: val })
        }
      }
      continue
    }

    const key = readIdent()
    if (!key) {
      i++
      continue
    }

    skipWs()

    if (i < len && s[i] === '^' && s[i + 1] === '(') {
      const bp = readParenBreakpoint()
      if (i < len && s[i] === '=') {
        i++
        const val = readUnquotedValue()
        let attr = attrs.find((a) => a.key === key)
        if (!attr) {
          attr = { key, boolean: false }
          attrs.push(attr)
        }
        attr.boolean = false
        if (!attr.overrides) attr.overrides = []
        attr.overrides.push({ breakpoint: bp, value: val })
      }
      continue
    }

    if (i < len && s[i] === '=') {
      i++
      skipWs()
      let value: string
      if (s[i] === '"' || s[i] === "'") {
        value = readQuoted()
      } else {
        value = readUnquotedValue()
      }
      attrs.push({ key, boolean: false, value })
      continue
    }

    attrs.push({ key, boolean: true })
  }

  return attrs
}
