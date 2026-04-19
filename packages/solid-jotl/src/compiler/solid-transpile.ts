/**
 * Rewrite a JOTL `>> script:` body so that the compile-time markers `signal`,
 * `effect`, `memo`, `resource` map to SolidJS primitives, and assignments to
 * signal-bound names become setter calls.
 *
 * Source surface (what the author writes):
 *
 *   let count = signal(0)
 *   let doubled = memo(() => count() * 2)
 *   effect(() => console.log(count()))
 *   function bump() { count = count + 1 }
 *
 * Rewrites to:
 *
 *   const [count, setCount] = createSignal(0)
 *   const doubled = createMemo(() => count() * 2)
 *   createEffect(() => console.log(count()))
 *   function bump() { setCount(count() + 1) }
 *
 * This file is intentionally a token-level rewriter (no full parser): same
 * trade-off as packages/compiler/src/compiler/targets/typescript/transpile.ts.
 * It's good enough for the JOTL script surface, which by design avoids
 * grammar-heavy JS features.
 */

import type { SolidImports } from './prelude'

export type SignalSet = Set<string>

export type TranspileOptions = {
  /**
   * Names already known to be signals from an outer scope (e.g. file-level
   * signals visible to a component-level script). These won't be redeclared,
   * but assignments to them lower to setter calls.
   */
  inheritedSignals?: SignalSet
  /**
   * Whether to register `props` as a non-signal identifier guarded against
   * accidental rewriting (only relevant inside a component body).
   */
  hasProps?: boolean
}

export type TranspileOutput = {
  /** The rewritten script body. */
  code: string
  /** Names declared as signals in this body (not including inherited). */
  declaredSignals: SignalSet
  /** Used Solid primitives, for prelude generation. */
  imports: SolidImports
  /** ES `import` statements hoisted out of the body. */
  hoistedImports: string[]
}

type Token =
  | { kind: 'word'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'punct'; value: string }
  | { kind: 'ws'; value: string }
  | { kind: 'number'; value: string }

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'super',
  'switch', 'this', 'throw', 'true', 'false', 'null', 'undefined', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'await',
])

const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '&&=', '||=', '??='])

export function transpileSolidScript(source: string, options: TranspileOptions = {}): TranspileOutput {
  const tokens = tokenize(source)
  const declaredSignals: SignalSet = new Set()
  const inherited: SignalSet = options.inheritedSignals ?? new Set()
  const imports: SolidImports = {
    createSignal: false,
    createEffect: false,
    createMemo: false,
    createResource: false,
    Show: false,
    Switch: false,
    For: false,
  }
  const hoistedImports: string[] = []

  // First pass: collect all top-level `let NAME = signal(...)` so the
  // assignment-rewriting pass can see signals defined later in the body.
  collectSignalDeclarations(tokens, declaredSignals)

  // Second pass: emit. We treat `inherited ∪ declared` as the live signal-set
  // for purposes of rewriting bare assignments.
  const liveSignals: SignalSet = new Set([...inherited, ...declaredSignals])

  const out: string[] = []
  let i = 0
  let depth = 0

  while (i < tokens.length) {
    const t = tokens[i]!

    if (t.kind === 'ws' || t.kind === 'comment') {
      out.push(t.value)
      i += 1
      continue
    }

    if (t.kind === 'punct') {
      if (t.value === '{') depth += 1
      else if (t.value === '}') depth -= 1
      out.push(t.value)
      i += 1
      continue
    }

    // Hoist top-level `import …` lines straight into the prelude.
    if (depth === 0 && t.kind === 'word' && t.value === 'import') {
      const stmt = readToStatementEnd(tokens, i)
      hoistedImports.push(stmt.text.trim())
      i = stmt.next
      continue
    }

    // `let NAME = signal(...)` / `let NAME = memo(...)` / `let NAME = resource(...)`
    if (depth === 0 && t.kind === 'word' && (t.value === 'let' || t.value === 'var')) {
      const handled = tryEmitSignalDecl(tokens, i, out, imports, declaredSignals)
      if (handled !== null) {
        i = handled
        continue
      }
      // Plain `let x = ...` (no signal/memo/resource): pass through unchanged.
      out.push(t.value)
      i += 1
      continue
    }

    // Bare `effect(...)` call → `createEffect(...)`. Detect by `effect`
    // followed (after trivia) by `(`.
    if (t.kind === 'word' && t.value === 'effect' && isCallSite(tokens, i) && !isMemberAccess(tokens, i)) {
      out.push('createEffect')
      imports.createEffect = true
      i += 1
      continue
    }

    // Assignment to a known signal: `count = expr`, `count += 1`, etc.
    if (t.kind === 'word' && liveSignals.has(t.value) && !isMemberAccess(tokens, i)) {
      const opIdx = nextNonTrivia(tokens, i + 1)
      const opTok = tokens[opIdx]
      if (opTok && opTok.kind === 'punct' && isAssignOp(tokens, opIdx)) {
        const opString = readAssignOp(tokens, opIdx)
        const rhsStart = opIdx + opString.tokenLen
        const rhs = readToStatementEnd(tokens, rhsStart)
        const setterName = `set${capitalize(t.value)}`
        const trimmedRhs = rhs.text.trimEnd()
        if (opString.value === '=') {
          out.push(`${setterName}(${trimmedRhs.trim()})`)
        } else {
          // For `+=` etc., expand to `setCount(count() + (rhs))` so that the
          // semantics match a normal compound assignment.
          const compoundOp = opString.value.slice(0, -1) // strip trailing '='
          out.push(`${setterName}(${t.value}() ${compoundOp} (${trimmedRhs.trim()}))`)
        }
        // Replay any trailing whitespace/newline so subsequent statements stay
        // on their own lines.
        const tail = rhs.text.slice(trimmedRhs.length)
        if (tail.length > 0) out.push(tail)
        i = rhs.next
        continue
      }
    }

    // Inside any scope: bare references to signals like `count` stay as
    // `count` because the user already invokes them with `count()`. We don't
    // auto-add the parens — that's the contract with the author.
    out.push(t.value)
    i += 1
  }

  return {
    code: out.join('').trimEnd(),
    declaredSignals,
    imports,
    hoistedImports,
  }
}

/* ───────────────────────────── Helpers ───────────────────────────── */

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]!
    if (/\s/u.test(ch)) {
      const start = i
      while (i < input.length && /\s/u.test(input[i]!)) i += 1
      tokens.push({ kind: 'ws', value: input.slice(start, i) })
      continue
    }
    if (ch === '/' && input[i + 1] === '/') {
      const nl = input.indexOf('\n', i)
      const stop = nl === -1 ? input.length : nl
      tokens.push({ kind: 'comment', value: input.slice(i, stop) })
      i = stop
      continue
    }
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2)
      const stop = end === -1 ? input.length : end + 2
      tokens.push({ kind: 'comment', value: input.slice(i, stop) })
      i = stop
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const start = i
      const quote = ch
      i += 1
      while (i < input.length) {
        const c = input[i]!
        if (c === '\\' && i + 1 < input.length) { i += 2; continue }
        if (c === quote) { i += 1; break }
        if (quote === '`' && c === '$' && input[i + 1] === '{') {
          let depth = 1
          i += 2
          while (i < input.length && depth > 0) {
            const cc = input[i]!
            if (cc === '{') depth += 1
            else if (cc === '}') depth -= 1
            i += 1
          }
          continue
        }
        i += 1
      }
      tokens.push({ kind: 'string', value: input.slice(start, i) })
      continue
    }
    if (/[0-9]/u.test(ch)) {
      const start = i
      while (i < input.length && /[0-9._eE+-]/u.test(input[i]!)) i += 1
      tokens.push({ kind: 'number', value: input.slice(start, i) })
      continue
    }
    if (/[A-Za-z_$]/u.test(ch)) {
      const start = i
      while (i < input.length && /[\w$]/u.test(input[i]!)) i += 1
      tokens.push({ kind: 'word', value: input.slice(start, i) })
      continue
    }
    tokens.push({ kind: 'punct', value: ch })
    i += 1
  }
  return tokens
}

function nextNonTrivia(tokens: Token[], from: number): number {
  let k = from
  while (k < tokens.length && (tokens[k]!.kind === 'ws' || tokens[k]!.kind === 'comment')) k += 1
  return k
}

function isMemberAccess(tokens: Token[], index: number): boolean {
  for (let k = index - 1; k >= 0; k -= 1) {
    const prev = tokens[k]!
    if (prev.kind === 'ws' || prev.kind === 'comment') continue
    return prev.kind === 'punct' && prev.value === '.'
  }
  return false
}

function isCallSite(tokens: Token[], index: number): boolean {
  const k = nextNonTrivia(tokens, index + 1)
  const next = tokens[k]
  return !!next && next.kind === 'punct' && next.value === '('
}

function findMatching(tokens: Token[], from: number, open: string, close: string): number {
  let depth = 0
  for (let i = from; i < tokens.length; i += 1) {
    const tok = tokens[i]!
    if (tok.kind !== 'punct') continue
    if (tok.value === open) depth += 1
    else if (tok.value === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return tokens.length
}

function collectSignalDeclarations(tokens: Token[], signals: SignalSet): void {
  let depth = 0
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!
    if (t.kind === 'punct') {
      if (t.value === '{') depth += 1
      else if (t.value === '}') depth -= 1
      continue
    }
    if (depth !== 0) continue
    if (t.kind !== 'word') continue
    if (t.value !== 'let' && t.value !== 'var') continue

    const nameIdx = nextNonTrivia(tokens, i + 1)
    const nameTok = tokens[nameIdx]
    if (!nameTok || nameTok.kind !== 'word') continue

    const eqIdx = nextNonTrivia(tokens, nameIdx + 1)
    const eqTok = tokens[eqIdx]
    if (!eqTok || eqTok.kind !== 'punct' || eqTok.value !== '=') continue

    const callIdx = nextNonTrivia(tokens, eqIdx + 1)
    const callTok = tokens[callIdx]
    if (!callTok || callTok.kind !== 'word') continue

    if (callTok.value === 'signal' || callTok.value === 'memo' || callTok.value === 'resource') {
      // Only treat `signal` (plain mutable) as a signal-set member. memo and
      // resource produce read-only accessors; we don't generate setters for
      // them but do still rewrite the `let` → `const` declaration in the
      // emitter pass.
      if (callTok.value === 'signal') signals.add(nameTok.value)
    }
  }
}

function tryEmitSignalDecl(
  tokens: Token[],
  i: number,
  out: string[],
  imports: SolidImports,
  declaredSignals: SignalSet,
): number | null {
  const nameIdx = nextNonTrivia(tokens, i + 1)
  const nameTok = tokens[nameIdx]
  if (!nameTok || nameTok.kind !== 'word') return null
  const name = nameTok.value

  const eqIdx = nextNonTrivia(tokens, nameIdx + 1)
  const eqTok = tokens[eqIdx]
  if (!eqTok || eqTok.kind !== 'punct' || eqTok.value !== '=') return null

  const callIdx = nextNonTrivia(tokens, eqIdx + 1)
  const callTok = tokens[callIdx]
  if (!callTok || callTok.kind !== 'word') return null

  const parenIdx = nextNonTrivia(tokens, callIdx + 1)
  const parenTok = tokens[parenIdx]
  if (!parenTok || parenTok.kind !== 'punct' || parenTok.value !== '(') return null

  const closeParen = findMatching(tokens, parenIdx, '(', ')')
  if (closeParen >= tokens.length) return null

  const argsText = renderSlice(tokens, parenIdx + 1, closeParen).trim()
  const tail = readPostExprTail(tokens, closeParen + 1)

  if (callTok.value === 'signal') {
    out.push(`const [${name}, set${capitalize(name)}] = createSignal(${argsText})${tail.text}`)
    imports.createSignal = true
    declaredSignals.add(name)
    return tail.next
  }
  if (callTok.value === 'memo') {
    out.push(`const ${name} = createMemo(${argsText})${tail.text}`)
    imports.createMemo = true
    return tail.next
  }
  if (callTok.value === 'resource') {
    out.push(`const [${name}] = createResource(${argsText})${tail.text}`)
    imports.createResource = true
    return tail.next
  }
  return null
}

function readPostExprTail(tokens: Token[], from: number): { text: string; next: number } {
  let i = from
  const parts: string[] = []
  // Consume optional semicolon and trailing whitespace up to (and including)
  // the next newline so the rewritten declaration sits cleanly on its own line.
  if (i < tokens.length && tokens[i]!.kind === 'punct' && tokens[i]!.value === ';') {
    parts.push(';')
    i += 1
  }
  while (i < tokens.length) {
    const t = tokens[i]!
    if (t.kind === 'ws') {
      parts.push(t.value)
      i += 1
      if (t.value.includes('\n')) break
      continue
    }
    if (t.kind === 'comment') {
      parts.push(t.value)
      i += 1
      continue
    }
    break
  }
  return { text: parts.join(''), next: i }
}

function readToStatementEnd(tokens: Token[], from: number): { text: string; next: number } {
  let i = from
  const parts: string[] = []
  let depth = 0
  while (i < tokens.length) {
    const t = tokens[i]!
    if (t.kind === 'punct') {
      if (t.value === '{' || t.value === '(' || t.value === '[') depth += 1
      else if (t.value === '}' || t.value === ')' || t.value === ']') {
        depth -= 1
        if (depth < 0) break
      }
      if (depth === 0 && t.value === ';') {
        parts.push(';')
        i += 1
        break
      }
      parts.push(t.value)
      i += 1
      continue
    }
    if (t.kind === 'ws') {
      if (depth === 0 && t.value.includes('\n')) {
        // Pause at newline boundary so caller can resume cleanly.
        parts.push(t.value)
        i += 1
        break
      }
      parts.push(t.value)
      i += 1
      continue
    }
    parts.push(t.value)
    i += 1
  }
  return { text: parts.join(''), next: i }
}

function renderSlice(tokens: Token[], start: number, end: number): string {
  const parts: string[] = []
  for (let i = start; i < end; i += 1) parts.push(tokens[i]!.value)
  return parts.join('')
}

function capitalize(name: string): string {
  if (name.length === 0) return name
  return name[0]!.toUpperCase() + name.slice(1)
}

function isAssignOp(tokens: Token[], index: number): boolean {
  const op = tokens[index]
  if (!op || op.kind !== 'punct') return false
  // Single-char `=` is the most common case; it must NOT be `==` or `===`.
  if (op.value === '=') {
    const next = tokens[index + 1]
    if (next && next.kind === 'punct' && next.value === '=') return false
    return true
  }
  // Multi-char compound assignments like `+=`, `*=`, etc. are spread across
  // two tokens by our tokenizer (the trailing `=`).
  const followingEq = tokens[index + 1]
  if (!followingEq || followingEq.kind !== 'punct' || followingEq.value !== '=') return false
  const candidate = `${op.value}=`
  return ASSIGN_OPS.has(candidate) && candidate !== '=' && candidate !== '==' && candidate !== '!='
}

function readAssignOp(tokens: Token[], index: number): { value: string; tokenLen: number } {
  const op = tokens[index]!
  if (op.kind === 'punct' && op.value === '=') return { value: '=', tokenLen: 1 }
  return { value: `${op.value}=`, tokenLen: 2 }
}

function _suppressUnused(): void {
  // Keep the import alive for downstream type re-exports.
  const _t: Token | undefined = undefined
  void _t
}
void _suppressUnused
