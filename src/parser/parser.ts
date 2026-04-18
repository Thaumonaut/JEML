import type {
  Attribute,
  BlockNode,
  DirectiveNode,
  DocumentDirective,
  JEMLDocument,
  Node,
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
      const rest = line.slice('>> meta'.length).trim()
      const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
      directives.push({ type: 'meta', attributes: parsed.attrs })
      ctx.index = parsed.nextIndex
      continue
    }

    if (line.startsWith('>> style')) {
      const rest = line.slice('>> style'.length).trim()
      const parsed = parseAttrsMaybeMultiline(ctx.lines, ctx.index, rest)
      directives.push({ type: 'style', attributes: parsed.attrs })
      ctx.index = parsed.nextIndex
      continue
    }

    if (line.startsWith('>> document')) {
      const rest = line.slice('>> document'.length).trim()
      if (!rest.startsWith(':')) {
        throw new Error(`Expected '>> document:' at line ${ctx.index + 1}`)
      }
      ctx.index += 1
      const children = parseNodes(ctx, { stopAtDocumentClose: true })
      directives.push({ type: 'document', children })
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
