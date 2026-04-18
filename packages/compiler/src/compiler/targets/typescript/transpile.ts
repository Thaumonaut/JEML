/**
 * Transpile a JEML `>> script` body into JavaScript that populates
 * `state` (reactive) and `handlers` (bound callbacks) objects supplied
 * by the runtime. See RULEBOOK §18 for the source surface:
 *
 *   let count = 0
 *   const MAX = 10
 *   increment () {
 *     count = count + 1
 *   }
 *
 * Produces (roughly):
 *
 *   state.count = 0;
 *   const MAX = 10;
 *   handlers.increment = function() {
 *     state.count = state.count + 1;
 *   };
 */

export type TranspileResult = {
  code: string
  stateNames: string[]
  handlerNames: string[]
}

export function transpileScript(source: string): TranspileResult {
  const tokens = tokenize(source)
  const stateNames = new Set<string>()
  const handlerNames = new Set<string>()

  collectDeclarations(tokens, stateNames, handlerNames)

  const rewritten = emitTopLevel(tokens, stateNames, handlerNames)

  return {
    code: rewritten.trimEnd(),
    stateNames: [...stateNames],
    handlerNames: [...handlerNames],
  }
}

type Token =
  | { kind: 'word'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'comment'; value: string }
  | { kind: 'punct'; value: string }
  | { kind: 'ws'; value: string }
  | { kind: 'number'; value: string }

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
    if (ch === '%' && input[i + 1] === '{') {
      const end = input.indexOf('%}', i + 2)
      const stop = end === -1 ? input.length : end + 2
      tokens.push({ kind: 'comment', value: input.slice(i, stop) })
      i = stop
      continue
    }
    if (ch === '%') {
      const nl = input.indexOf('\n', i)
      const stop = nl === -1 ? input.length : nl
      tokens.push({ kind: 'comment', value: input.slice(i, stop) })
      i = stop
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
        if (c === '\\' && i + 1 < input.length) {
          i += 2
          continue
        }
        if (c === quote) {
          i += 1
          break
        }
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
  while (k < tokens.length && (tokens[k]!.kind === 'ws' || tokens[k]!.kind === 'comment')) {
    k += 1
  }
  return k
}

function collectDeclarations(
  tokens: Token[],
  stateNames: Set<string>,
  handlerNames: Set<string>,
): void {
  let depth = 0
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!
    if (token.kind === 'punct') {
      if (token.value === '{') depth += 1
      else if (token.value === '}') depth -= 1
      continue
    }
    if (depth !== 0) continue
    if (token.kind !== 'word') continue

    if (token.value === 'let' || token.value === 'var') {
      const nameIdx = nextNonTrivia(tokens, i + 1)
      const name = tokens[nameIdx]
      if (name && name.kind === 'word') {
        stateNames.add(name.value)
      }
      continue
    }

    if (token.value === 'const' || token.value === 'function' || token.value === 'return') {
      continue
    }

    const afterName = nextNonTrivia(tokens, i + 1)
    const afterTok = tokens[afterName]
    if (afterTok && afterTok.kind === 'punct' && afterTok.value === '(') {
      const closeParen = findMatching(tokens, afterName, '(', ')')
      const braceIdx = nextNonTrivia(tokens, closeParen + 1)
      const braceTok = tokens[braceIdx]
      if (braceTok && braceTok.kind === 'punct' && braceTok.value === '{') {
        handlerNames.add(token.value)
      }
    }
  }
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

function emitTopLevel(
  tokens: Token[],
  stateNames: Set<string>,
  handlerNames: Set<string>,
): string {
  const parts: string[] = []
  let i = 0
  let depth = 0
  while (i < tokens.length) {
    const token = tokens[i]!
    if (token.kind === 'ws' || token.kind === 'comment') {
      parts.push(token.value)
      i += 1
      continue
    }
    if (token.kind === 'punct') {
      if (token.value === '{') depth += 1
      else if (token.value === '}') depth -= 1
      parts.push(token.value)
      i += 1
      continue
    }
    if (depth !== 0) {
      parts.push(rewriteIdentifierAtIndex(tokens, i, stateNames, handlerNames))
      i += 1
      continue
    }

    if (token.kind === 'word' && (token.value === 'let' || token.value === 'var')) {
      const nameIdx = nextNonTrivia(tokens, i + 1)
      const nameTok = tokens[nameIdx]
      if (nameTok && nameTok.kind === 'word') {
        parts.push('state.')
        parts.push(nameTok.value)
        for (let j = i + 1; j < nameIdx; j += 1) {
          if (tokens[j]!.kind === 'comment') {
            parts.push(tokens[j]!.value)
          }
        }
        i = nameIdx + 1
        const body = consumeStatement(tokens, i, stateNames, handlerNames)
        parts.push(body.text)
        i = body.next
        continue
      }
    }

    if (token.kind === 'word' && handlerNames.has(token.value)) {
      const afterName = nextNonTrivia(tokens, i + 1)
      const afterTok = tokens[afterName]
      if (afterTok && afterTok.kind === 'punct' && afterTok.value === '(') {
        const paramsEnd = findMatching(tokens, afterName, '(', ')')
        const braceIdx = nextNonTrivia(tokens, paramsEnd + 1)
        const braceTok = tokens[braceIdx]
        if (braceTok && braceTok.kind === 'punct' && braceTok.value === '{') {
          const bodyEnd = findMatching(tokens, braceIdx, '{', '}')
          const paramText = renderSlice(tokens, afterName, paramsEnd + 1)
          const bodyInnerText = renderSliceTransformed(
            tokens,
            braceIdx + 1,
            bodyEnd,
            stateNames,
            handlerNames,
          )
          parts.push(`handlers.${token.value} = function${paramText} {${bodyInnerText}};`)
          i = bodyEnd + 1
          continue
        }
      }
    }

    parts.push(rewriteIdentifierAtIndex(tokens, i, stateNames, handlerNames))
    i += 1
  }
  return parts.join('')
}

function consumeStatement(
  tokens: Token[],
  from: number,
  stateNames: Set<string>,
  handlerNames: Set<string>,
): { text: string; next: number } {
  let i = from
  const parts: string[] = []
  let depth = 0
  while (i < tokens.length) {
    const token = tokens[i]!
    if (token.kind === 'punct') {
      if (token.value === '{' || token.value === '(' || token.value === '[') depth += 1
      else if (token.value === '}' || token.value === ')' || token.value === ']') depth -= 1
      if (depth < 0) break
      if (depth === 0 && (token.value === ';' || token.value === '\n')) {
        parts.push(token.value)
        i += 1
        return { text: parts.join(''), next: i }
      }
      parts.push(token.value)
      i += 1
      continue
    }
    if (token.kind === 'ws') {
      if (depth === 0 && token.value.includes('\n')) {
        parts.push(token.value)
        i += 1
        return { text: parts.join(''), next: i }
      }
      parts.push(token.value)
      i += 1
      continue
    }
    parts.push(rewriteIdentifierAtIndex(tokens, i, stateNames, handlerNames))
    i += 1
  }
  return { text: parts.join(''), next: i }
}

function renderSlice(tokens: Token[], start: number, end: number): string {
  const parts: string[] = []
  for (let i = start; i < end; i += 1) {
    parts.push(tokens[i]!.value)
  }
  return parts.join('')
}

function renderSliceTransformed(
  tokens: Token[],
  start: number,
  end: number,
  stateNames: Set<string>,
  handlerNames: Set<string>,
): string {
  const parts: string[] = []
  for (let i = start; i < end; i += 1) {
    parts.push(rewriteIdentifierAtIndex(tokens, i, stateNames, handlerNames))
  }
  return parts.join('')
}

function rewriteIdentifierAtIndex(
  tokens: Token[],
  index: number,
  stateNames: Set<string>,
  handlerNames: Set<string>,
): string {
  const token = tokens[index]
  if (!token) return ''
  if (token.kind !== 'word') return token.value
  if (isReservedWord(token.value)) return token.value
  if (!stateNames.has(token.value) && !handlerNames.has(token.value)) return token.value
  if (isMemberAccess(tokens, index)) return token.value
  if (isPropertyShorthandOrKey(tokens, index)) return token.value
  if (stateNames.has(token.value)) return `state.${token.value}`
  return `handlers.${token.value}`
}

function isMemberAccess(tokens: Token[], index: number): boolean {
  for (let k = index - 1; k >= 0; k -= 1) {
    const prev = tokens[k]!
    if (prev.kind === 'ws' || prev.kind === 'comment') continue
    return prev.kind === 'punct' && prev.value === '.'
  }
  return false
}

function isPropertyShorthandOrKey(tokens: Token[], index: number): boolean {
  for (let k = index + 1; k < tokens.length; k += 1) {
    const next = tokens[k]!
    if (next.kind === 'ws' || next.kind === 'comment') continue
    if (next.kind === 'punct' && next.value === ':') {
      for (let j = index - 1; j >= 0; j -= 1) {
        const prev = tokens[j]!
        if (prev.kind === 'ws' || prev.kind === 'comment') continue
        if (prev.kind === 'punct' && (prev.value === '{' || prev.value === ',')) return true
        return false
      }
    }
    return false
  }
  return false
}

const RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'of',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'false',
  'null',
  'undefined',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'async',
  'await',
])

function isReservedWord(value: string): boolean {
  return RESERVED.has(value)
}
