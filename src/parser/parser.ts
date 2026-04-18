import type {
  Attribute,
  BlockNode,
  ControlForNode,
  ControlIfBranch,
  ControlIfNode,
  DirectiveNode,
  DocumentDirective,
  ImportDirective,
  JEMLDocument,
  Node,
  ScriptDirective,
  SiblingItemNode,
  StyleDirective,
  TextNode,
  VoidNode,
} from './ast'
import { parseAttributes } from './attributes'

export { parseAttributes } from './attributes'

type ParseContext = {
  lines: string[]
  index: number
}

const BLOCK_COMMENT_RE = /%\{[\s\S]*?%\}/g

export function parse(source: string): JEMLDocument {
  const stripped = source.replace(BLOCK_COMMENT_RE, '')
  const ctx: ParseContext = { lines: stripped.split(/\r?\n/u), index: 0 }
  const directives: DirectiveNode[] = []

  while (ctx.index < ctx.lines.length) {
    const raw = ctx.lines[ctx.index] ?? ''
    const line = raw.trim()
    if (line === '' || line.startsWith('%')) {
      ctx.index += 1
      continue
    }

    if (line.startsWith('>> meta')) {
      directives.push(parseMetaDirective(ctx))
      continue
    }

    if (line.startsWith('>> style')) {
      directives.push(parseStyleDirective(ctx))
      continue
    }

    if (line.startsWith('>> import')) {
      directives.push(parseImportDirective(ctx))
      continue
    }

    if (line.startsWith('>> script')) {
      directives.push(parseScriptDirective(ctx))
      continue
    }

    if (line.startsWith('>> document')) {
      directives.push(parseDocumentDirective(ctx))
      continue
    }

    if (line.startsWith('>>')) {
      ctx.index += 1
      continue
    }

    ctx.index += 1
  }

  return { directives }
}

function parseMetaDirective(ctx: ParseContext): DirectiveNode {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  const rest = line.slice('>> meta'.length).trim()
  const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
  ctx.index = parsed.nextIndex
  consumeOptionalDirectiveClose(ctx, 'meta')
  return { type: 'meta', attributes: parsed.attrs }
}

function parseStyleDirective(ctx: ParseContext): StyleDirective {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  const rest = line.slice('>> style'.length).trim()
  const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
  ctx.index = parsed.nextIndex

  const body = readOptionalBraceBody(ctx, parsed.rest)
  consumeOptionalDirectiveClose(ctx, 'style')

  const directive: StyleDirective = { type: 'style', attributes: parsed.attrs }
  if (body !== undefined) directive.body = body
  return directive
}

function parseImportDirective(ctx: ParseContext): ImportDirective {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  const rest = line.slice('>> import'.length).trim()
  const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
  ctx.index = parsed.nextIndex

  let spec = parsed.rest.trim()
  if (!spec.startsWith(':')) {
    throw new Error(`Expected ':' after >> import attributes at line ${ctx.index}`)
  }
  spec = spec.slice(1).trim()

  const from = parsed.attrs.find((a) => a.key === 'from')?.value ?? ''
  const { kind, names } = parseImportSpec(spec)

  consumeOptionalDirectiveClose(ctx, 'import')

  return {
    type: 'import',
    from,
    attributes: parsed.attrs,
    kind,
    names,
  }
}

function parseImportSpec(spec: string): { kind: ImportDirective['kind']; names: string[] } {
  const trimmed = spec.trim()
  if (trimmed.startsWith('{')) {
    const close = trimmed.indexOf('}')
    const inner = trimmed.slice(1, close >= 0 ? close : trimmed.length)
    const names = inner
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
    return { kind: 'named', names }
  }
  if (trimmed.startsWith('*')) {
    const asMatch = /^\*\s+as\s+([a-zA-Z_][\w]*)/u.exec(trimmed)
    return { kind: 'namespace', names: asMatch ? [asMatch[1] ?? ''] : [] }
  }
  const idMatch = /^([a-zA-Z_][\w]*)/u.exec(trimmed)
  return { kind: 'default', names: idMatch ? [idMatch[1] ?? ''] : [] }
}

function parseScriptDirective(ctx: ParseContext): ScriptDirective {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  const rest = line.slice('>> script'.length).trim()
  const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
  ctx.index = parsed.nextIndex

  const body = readOptionalBraceBody(ctx, parsed.rest) ?? ''
  consumeOptionalDirectiveClose(ctx, 'script')

  return { type: 'script', attributes: parsed.attrs, body }
}

function parseDocumentDirective(ctx: ParseContext): DocumentDirective {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  const rest = line.slice('>> document'.length).trim()
  if (!rest.startsWith(':')) {
    throw new Error(`Expected '>> document:' at line ${ctx.index + 1}`)
  }
  ctx.index += 1
  const children = parseNodes(ctx, { stopAtDocumentClose: true })
  return { type: 'document', children }
}

/**
 * After a `>> directive [...]:` header, read an optional `{ ... }` body.
 * `rest` is the remaining text on the header line after `]` (may start with `:` and `{`).
 * If the next non-empty line is `{`, consume it. Body is returned without surrounding braces.
 */
function readOptionalBraceBody(ctx: ParseContext, rest: string): string | undefined {
  let remainder = rest.trim()
  if (remainder.startsWith(':')) {
    remainder = remainder.slice(1).trim()
  }

  if (!remainder.startsWith('{')) {
    while (ctx.index < ctx.lines.length) {
      const peek = (ctx.lines[ctx.index] ?? '').trim()
      if (peek === '' || peek.startsWith('%')) {
        ctx.index += 1
        continue
      }
      if (peek.startsWith('{')) {
        remainder = peek
        break
      }
      return undefined
    }
    if (!remainder.startsWith('{')) return undefined
    ctx.index += 1
  }

  let buffer = remainder.slice(1)
  let depth = 1
  const bodyParts: string[] = []

  const pushLine = (text: string, appendNewline: boolean): boolean => {
    let i = 0
    let inString: '"' | "'" | '`' | null = null
    while (i < text.length) {
      const ch = text[i]!
      if (inString) {
        if (ch === '\\' && i + 1 < text.length) {
          i += 2
          continue
        }
        if (ch === inString) inString = null
        i += 1
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch as '"' | "'" | '`'
        i += 1
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          bodyParts.push(text.slice(0, i))
          return true
        }
      }
      i += 1
    }
    bodyParts.push(text)
    if (appendNewline) bodyParts.push('\n')
    return false
  }

  if (pushLine(buffer, true)) {
    return bodyParts.join('')
  }

  while (ctx.index < ctx.lines.length) {
    const raw = ctx.lines[ctx.index] ?? ''
    ctx.index += 1
    if (pushLine(raw, ctx.index < ctx.lines.length)) {
      return bodyParts.join('')
    }
  }

  throw new Error('Unclosed { body } in directive')
}

function consumeOptionalDirectiveClose(ctx: ParseContext, expectedTag?: string): void {
  while (ctx.index < ctx.lines.length) {
    const peek = (ctx.lines[ctx.index] ?? '').trim()
    if (peek === '' || peek.startsWith('%')) {
      ctx.index += 1
      continue
    }
    const match = /^<<(?:\s+([a-zA-Z][\w-]*))?\s*$/u.exec(peek)
    if (!match) return
    const tag = match[1]
    if (tag && expectedTag && tag !== expectedTag) return
    ctx.index += 1
    return
  }
}

function parseNodes(ctx: ParseContext, options: { stopAtDocumentClose: boolean }): Node[] {
  const nodes: Node[] = []

  while (ctx.index < ctx.lines.length) {
    const raw = ctx.lines[ctx.index] ?? ''
    const trimmed = raw.trim()

    if (trimmed === '') {
      ctx.index += 1
      continue
    }

    if (trimmed.startsWith('%')) {
      ctx.index += 1
      continue
    }

    if (options.stopAtDocumentClose && /^(<<\s*document\s*)$/u.test(trimmed)) {
      ctx.index += 1
      break
    }

    if (/^```/u.test(trimmed)) {
      nodes.push(parseFencedCode(ctx))
      continue
    }

    if (trimmed.startsWith('~ if') || trimmed.startsWith('~ for')) {
      nodes.push(parseControl(ctx))
      continue
    }

    if (trimmed === '~<' || trimmed === '~ else' || trimmed.startsWith('~ else')) {
      break
    }

    if (trimmed.startsWith('> ')) {
      nodes.push(parseBlock(ctx))
      continue
    }

    if (trimmed.startsWith('!> ')) {
      nodes.push(parseVoid(ctx))
      continue
    }

    if (trimmed.startsWith('- ')) {
      nodes.push(parseSibling(ctx))
      continue
    }

    nodes.push({ type: 'text', value: trimmed } satisfies TextNode)
    ctx.index += 1
  }

  return nodes
}

function parseControl(ctx: ParseContext): ControlIfNode | ControlForNode {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  if (line.startsWith('~ for')) {
    return parseControlFor(ctx)
  }
  return parseControlIf(ctx)
}

function parseControlIf(ctx: ParseContext): ControlIfNode {
  const branches: ControlIfBranch[] = []
  const first = (ctx.lines[ctx.index] ?? '').trim()
  const firstCond = extractParenthesized(first.replace(/^~\s*if/u, '').trim())
  ctx.index += 1
  branches.push({ condition: firstCond, children: parseBlockSubtree(ctx) })

  while (ctx.index < ctx.lines.length) {
    const peek = (ctx.lines[ctx.index] ?? '').trim()
    if (peek.startsWith('~ else if')) {
      const cond = extractParenthesized(peek.replace(/^~\s*else\s+if/u, '').trim())
      ctx.index += 1
      branches.push({ condition: cond, children: parseBlockSubtree(ctx) })
      continue
    }
    if (peek === '~ else' || peek.startsWith('~ else')) {
      ctx.index += 1
      branches.push({ condition: '', children: parseBlockSubtree(ctx) })
      continue
    }
    break
  }

  if (ctx.index < ctx.lines.length) {
    const closer = (ctx.lines[ctx.index] ?? '').trim()
    if (closer === '~<') ctx.index += 1
  }

  return { type: 'control-if', branches }
}

function parseControlFor(ctx: ParseContext): ControlForNode {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  const body = line.replace(/^~\s*for/u, '').trim()
  const spec = extractParenthesized(body)
  const match = /^(.*?)\s+as\s+\$([a-zA-Z_][\w]*)(?:\s*,\s*\$([a-zA-Z_][\w]*))?\s*$/u.exec(spec)
  if (!match) {
    throw new Error(`Invalid ~ for header near line ${ctx.index + 1}`)
  }
  const iterable = (match[1] ?? '').trim()
  const item = match[2] ?? ''
  const index = match[3]
  ctx.index += 1
  const children = parseBlockSubtree(ctx)
  if (ctx.index < ctx.lines.length) {
    const closer = (ctx.lines[ctx.index] ?? '').trim()
    if (closer === '~<') ctx.index += 1
  }
  const node: ControlForNode = { type: 'control-for', iterable, item, children }
  if (index) node.index = index
  return node
}

function extractParenthesized(input: string): string {
  const trimmed = input.trim()
  if (!trimmed.startsWith('(')) return trimmed
  const close = findMatchingParen(trimmed, 0)
  return trimmed.slice(1, close).trim()
}

function findMatchingParen(input: string, openIndex: number): number {
  let depth = 0
  for (let i = openIndex; i < input.length; i += 1) {
    const ch = input[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return input.length
}

/**
 * Parse the body of a `~ if` / `~ for` branch until we hit `~<`, `~ else`, `~ else if`,
 * or an outer block closer. Nested `~`-blocks are consumed recursively by `parseNodes`.
 */
function parseBlockSubtree(ctx: ParseContext): Node[] {
  const nodes: Node[] = []
  while (ctx.index < ctx.lines.length) {
    const raw = ctx.lines[ctx.index] ?? ''
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('%')) {
      ctx.index += 1
      continue
    }
    if (trimmed === '~<' || trimmed.startsWith('~ else')) break
    const closer = tryParseBlockClose(trimmed)
    if (closer) break

    if (/^```/u.test(trimmed)) {
      nodes.push(parseFencedCode(ctx))
      continue
    }
    if (trimmed.startsWith('~ if') || trimmed.startsWith('~ for')) {
      nodes.push(parseControl(ctx))
      continue
    }
    if (trimmed.startsWith('> ')) {
      nodes.push(parseBlock(ctx))
      continue
    }
    if (trimmed.startsWith('!> ')) {
      nodes.push(parseVoid(ctx))
      continue
    }
    if (trimmed.startsWith('- ')) {
      nodes.push(parseSibling(ctx))
      continue
    }
    nodes.push({ type: 'text', value: trimmed } satisfies TextNode)
    ctx.index += 1
  }
  return nodes
}

function parseFencedCode(ctx: ParseContext): Node {
  const opener = (ctx.lines[ctx.index] ?? '').trim()
  const language = opener.replace(/^```/u, '').trim()
  ctx.index += 1
  const buffer: string[] = []
  while (ctx.index < ctx.lines.length) {
    const raw = ctx.lines[ctx.index] ?? ''
    if (raw.trim() === '```') {
      ctx.index += 1
      break
    }
    buffer.push(raw.replace(/^  /u, ''))
    ctx.index += 1
  }
  return {
    type: 'fenced-code',
    language,
    code: buffer.join('\n'),
  }
}

function tryParseBlockClose(trimmed: string): { tag: string | null } | null {
  if (trimmed === '<') {
    return { tag: null }
  }
  const named = /^<\s+([a-zA-Z][\w-]*)\s*$/u.exec(trimmed)
  if (named) {
    return { tag: named[1] ?? null }
  }
  return null
}

function parseBlockBody(ctx: ParseContext, closeTag: string): Node[] {
  const nodes: Node[] = []
  while (ctx.index < ctx.lines.length) {
    const raw = ctx.lines[ctx.index] ?? ''
    const trimmed = raw.trim()

    if (trimmed === '' || trimmed.startsWith('%')) {
      ctx.index += 1
      continue
    }

    const closer = tryParseBlockClose(trimmed)
    if (closer) {
      if (closer.tag === null || closer.tag === closeTag) {
        ctx.index += 1
        return nodes
      }
      throw new Error(
        `Unexpected block close "${trimmed}" while expecting < or < ${closeTag} at line ${ctx.index + 1}`,
      )
    }

    if (trimmed.startsWith('~ if') || trimmed.startsWith('~ for')) {
      nodes.push(parseControl(ctx))
      continue
    }

    if (trimmed.startsWith('> ')) {
      nodes.push(parseBlock(ctx))
      continue
    }
    if (trimmed.startsWith('!> ')) {
      nodes.push(parseVoid(ctx))
      continue
    }
    if (trimmed.startsWith('- ')) {
      nodes.push(parseSibling(ctx))
      continue
    }
    if (/^```/u.test(trimmed)) {
      nodes.push(parseFencedCode(ctx))
      continue
    }

    nodes.push({ type: 'text', value: trimmed } satisfies TextNode)
    ctx.index += 1
  }
  throw new Error(`Unclosed block > ${closeTag}`)
}

function parseBlockOpener(ctx: ParseContext): {
  tag: string
  variants: string[]
  attrs: Attribute[]
  afterColon: string
} {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  if (!line.startsWith('> ')) {
    throw new Error(`Expected block line at ${ctx.index + 1}`)
  }
  let rest = line.slice(2).trim()

  const tagMatch = /^([a-zA-Z][\w-]*)/u.exec(rest)
  if (!tagMatch) {
    throw new Error(`Invalid block tag at line ${ctx.index + 1}`)
  }
  const tag = tagMatch[1] ?? ''
  rest = rest.slice(tag.length).trim()

  const variants: string[] = []
  while (rest.startsWith('.')) {
    const vm = /^\.([a-zA-Z0-9][\w-]*)/u.exec(rest)
    if (!vm) break
    variants.push(vm[1] ?? '')
    rest = rest.slice(vm[0]!.length).trim()
  }

  let attrs: Attribute[] = []
  if (rest.startsWith('[')) {
    const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
    attrs = parsed.attrs
    rest = parsed.rest.trim()
    ctx.index = parsed.nextIndex
  } else {
    ctx.index += 1
  }

  if (!rest.startsWith(':')) {
    throw new Error(`Expected ':' after block opening for "${tag}" near line ${ctx.index}`)
  }
  const afterColon = rest.slice(1).trim()

  if (tag === 'heading') {
    const levelVariant = variants[0]
    if (!levelVariant || !/^[1-6]$/u.test(levelVariant)) {
      throw new Error(`heading must use .1–.6 (e.g. > heading.2:) at line ${ctx.index}`)
    }
  }

  return { tag, variants, attrs, afterColon }
}

function parseBlock(ctx: ParseContext): BlockNode {
  const { tag, variants, attrs, afterColon } = parseBlockOpener(ctx)

  const singleMatch = /^(.*?)\s*<\s*$/u.exec(afterColon)
  if (singleMatch !== null && afterColon.includes('<')) {
    const inner = singleMatch[1]?.trim() ?? ''
    const children: Node[] = inner.length > 0 ? [{ type: 'text', value: inner }] : []
    return { type: 'block', tag, variants, attributes: attrs, children }
  }

  const nodes: Node[] = []
  if (afterColon.length > 0) {
    nodes.push({ type: 'text', value: afterColon })
  }
  const inner = parseBlockBody(ctx, tag)
  nodes.push(...inner)
  return { type: 'block', tag, variants, attributes: attrs, children: nodes }
}

function parseVoid(ctx: ParseContext): VoidNode {
  const line = (ctx.lines[ctx.index] ?? '').trim()
  if (!line.startsWith('!> ')) {
    throw new Error(`Expected void at line ${ctx.index + 1}`)
  }
  let rest = line.slice(3).trim()

  const tagMatch = /^([a-zA-Z][\w-]*)/u.exec(rest)
  if (!tagMatch) {
    throw new Error(`Invalid void tag at line ${ctx.index + 1}`)
  }
  const tag = tagMatch[1] ?? ''
  rest = rest.slice(tag.length).trim()

  const variants: string[] = []
  while (rest.startsWith('.')) {
    const vm = /^\.([a-zA-Z0-9][\w-]*)/u.exec(rest)
    if (!vm) break
    variants.push(vm[1] ?? '')
    rest = rest.slice(vm[0]!.length).trim()
  }

  let attrs: Attribute[] = []
  if (rest.startsWith('[')) {
    const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
    attrs = parsed.attrs
    ctx.index = parsed.nextIndex
  } else {
    if (rest.length > 0) {
      throw new Error(`Unexpected void syntax at line ${ctx.index + 1}: ${rest}`)
    }
    ctx.index += 1
  }

  return { type: 'void', tag, variants, attributes: attrs }
}

function parseSibling(ctx: ParseContext): SiblingItemNode {
  const line = (ctx.lines[ctx.index] ?? '').trim().slice(2).trim()
  const attrsResult = parseAttrsMaybeMultiline(ctx.lines, ctx.index, line)
  ctx.index = attrsResult.nextIndex
  const children: Node[] = []
  const content = attrsResult.rest.trim()
  if (content.length > 0) {
    children.push({ type: 'text', value: content })
  }
  return { type: 'sibling-item', attributes: attrsResult.attrs, children }
}

function parseAttrsMaybeMultiline(
  lines: string[],
  index: number,
  initialRest: string,
): { attrs: Attribute[]; rest: string; nextIndex: number } {
  let rest = initialRest
  let currentIndex = index
  if (!rest.startsWith('[')) {
    return { attrs: [], rest, nextIndex: currentIndex + 1 }
  }

  let attrBuffer = rest
  while (!attrBuffer.includes(']') && currentIndex + 1 < lines.length) {
    currentIndex += 1
    attrBuffer += ` ${String(lines[currentIndex] ?? '').trim()}`
  }

  const closeIndex = attrBuffer.indexOf(']')
  const rawAttrs = attrBuffer.slice(1, closeIndex >= 0 ? closeIndex : attrBuffer.length)
  rest = attrBuffer.slice(closeIndex + 1).trim()
  return {
    attrs: parseAttributes(rawAttrs),
    rest,
    nextIndex: currentIndex + 1,
  }
}
