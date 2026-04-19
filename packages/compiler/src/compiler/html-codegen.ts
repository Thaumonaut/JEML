import type {
  Attribute,
  BlockNode,
  ControlForNode,
  ControlIfNode,
  DocumentDirective,
  ImportDirective,
  JotlDocument,
  Node,
  ScriptDirective,
  SiblingItemNode,
  StyleDirective,
  VoidNode,
} from '../parser/ast'
import { parseAttributes } from '../parser/attributes'
import { CLIENT_RUNTIME } from '../runtime/embed'
import { BASE_CSS } from './preset-styles'
import { transpileScript } from './targets/typescript/transpile'

type HtmlGenContext = {
  responsiveRules: string[]
  nextR: number
  /** True when the document uses script/import/control-flow/references. */
  dynamic: boolean
}

let activeDynamic = false

export function generateHtml(ast: JotlDocument): string {
  const dynamic = documentIsDynamic(ast)
  const ctx: HtmlGenContext = { responsiveRules: [], nextR: 0, dynamic }
  const priorDynamic = activeDynamic
  activeDynamic = dynamic
  try {
    return generateHtmlInner(ast, ctx, dynamic)
  } finally {
    activeDynamic = priorDynamic
  }
}

function generateHtmlInner(ast: JotlDocument, ctx: HtmlGenContext, dynamic: boolean): string {
  const headLines: string[] = []
  const documentDirective = ast.directives.find((directive): directive is DocumentDirective => directive.type === 'document')

  if (resolvePresetMode(ast) === 'base') {
    headLines.push('<style data-jotl-preset="base">')
    headLines.push(BASE_CSS.trim())
    headLines.push('</style>')
  }

  for (const directive of ast.directives) {
    if (directive.type === 'meta') {
      for (const attr of directive.attributes) {
        if (attr.boolean || attr.value === undefined) continue
        if (attr.key === 'title') {
          headLines.push(`<title>${escapeHtml(attr.value)}</title>`)
        } else if (attr.key === 'description') {
          headLines.push(`<meta name="description" content="${escapeAttr(attr.value)}">`)
        } else if (attr.key === 'icon') {
          headLines.push(`<link rel="icon" href="${escapeAttr(attr.value)}">`)
        } else if (attr.key === 'scale') {
          headLines.push(`<meta name="viewport" content="width=device-width, initial-scale=${escapeAttr(attr.value)}">`)
        } else {
          headLines.push(`<meta name="${escapeAttr(attr.key)}" content="${escapeAttr(attr.value)}">`)
        }
      }
    }
    if (directive.type === 'style') {
      // The `preset` attribute is consumed by resolvePresetMode and produces
      // no per-directive output; skip it so a bare `>> style [preset=none]`
      // doesn't leak an empty <style> block.
      const ref = findAttribute(directive.attributes, 'ref')
      if (ref) {
        headLines.push(`<link rel="stylesheet" href="${escapeAttr(ref)}">`)
      }
      if (directive.body && directive.body.trim().length > 0) {
        headLines.push('<style>')
        headLines.push(directive.body.trim())
        headLines.push('</style>')
      }
    }
  }

  const bodyLines = documentDirective ? emitNodes(documentDirective.children, null, ctx) : []
  const output: string[] = ['<!DOCTYPE html>', '<html>']
  if (headLines.length === 0 && ctx.responsiveRules.length === 0) {
    output.push('<head></head>')
  } else {
    output.push('<head>')
    output.push(...headLines)
    if (ctx.responsiveRules.length > 0) {
      output.push('<style>')
      output.push(ctx.responsiveRules.join('\n'))
      output.push('</style>')
    }
    output.push('</head>')
  }
  output.push('<body>')
  output.push(...bodyLines)
  if (dynamic) {
    const scriptTag = buildClientScriptTag(ast)
    if (scriptTag) output.push(scriptTag)
  }
  output.push('</body>', '</html>')
  return `${output.join('\n')}\n`
}

/**
 * Decide whether to inject the base preset stylesheet.
 *
 *  - `base` (default): no `>> style` directive opts out, so we ship the preset
 *  - `none`: at least one `>> style [preset=none]` directive is present
 *
 * Explicit `>> style [preset=base]` is honored as a no-op against the default,
 * but a single `[preset=none]` anywhere in the document wins.
 */
function resolvePresetMode(ast: JotlDocument): 'base' | 'none' {
  for (const directive of ast.directives) {
    if (directive.type !== 'style') continue
    const styleDirective = directive as StyleDirective
    const preset = findAttribute(styleDirective.attributes, 'preset')
    if (preset === 'none') return 'none'
  }
  return 'base'
}

function documentIsDynamic(ast: JotlDocument): boolean {
  for (const directive of ast.directives) {
    if (directive.type === 'script' || directive.type === 'import') return true
    if (directive.type === 'document' && nodesContainDynamic(directive.children)) return true
  }
  return false
}

function nodesContainDynamic(nodes: Node[]): boolean {
  for (const node of nodes) {
    if (node.type === 'control-if' || node.type === 'control-for') return true
    if (node.type === 'block' || node.type === 'void' || node.type === 'sibling-item') {
      if (attrsHaveRefs((node as { attributes: Attribute[] }).attributes)) return true
    }
    if (node.type === 'block' || node.type === 'sibling-item') {
      if (nodesContainDynamic(node.children)) return true
    }
    if (node.type === 'text' && textHasRefs(node.value)) return true
  }
  return false
}

function attrsHaveRefs(attrs: Attribute[]): boolean {
  for (const attr of attrs) {
    if (attr.key.startsWith('on_')) return true
    if (attr.value === undefined) continue
    if (attr.value.startsWith('&') || attr.value.startsWith('@') || attr.value.startsWith('$')) return true
    if (/\{[^{}]*\}/u.test(attr.value)) return true
  }
  return false
}

function textHasRefs(value: string): boolean {
  return DYNAMIC_TEXT_RE.test(value)
}

const DYNAMIC_TEXT_RE =
  /(?<![\w\\])(?:&[a-zA-Z_][\w.]*|@[a-zA-Z_][\w.]*|\$[a-zA-Z_][\w.]*)|(?<!\\)\{[^{}]*\}/u

function buildClientScriptTag(ast: JotlDocument): string | null {
  const scriptDirective = ast.directives.find((d): d is ScriptDirective => d.type === 'script')
  const imports = ast.directives.filter((d): d is ImportDirective => d.type === 'import')

  let userBody = ''
  if (scriptDirective) {
    const { code } = transpileScript(scriptDirective.body)
    userBody = code
  }

  const importLines: string[] = []
  for (const imp of imports) {
    if (imp.from.endsWith('.jot')) {
      importLines.push(`// [jotl] import of ${JSON.stringify(imp.from)} skipped: .jot imports are not yet supported`)
      continue
    }
    if (imp.kind === 'default') {
      importLines.push(`// import ${imp.names[0] ?? ''} from ${JSON.stringify(imp.from)};`)
    } else if (imp.kind === 'named') {
      importLines.push(`// import { ${imp.names.join(', ')} } from ${JSON.stringify(imp.from)};`)
    } else {
      importLines.push(`// import * as ${imp.names[0] ?? ''} from ${JSON.stringify(imp.from)};`)
    }
  }

  const body = [importLines.join('\n'), userBody].filter(Boolean).join('\n').trim()
  const injected = body || '/* no user script */'
  const runtime = CLIENT_RUNTIME.replace('__JOTL_USER_SCRIPT__', () => injected)
  const safe = runtime.replaceAll('</script>', '<\\/script>')
  return `<script>${safe}</script>`
}

function nextResponsiveId(ctx: HtmlGenContext): string {
  ctx.nextR += 1
  return `r${ctx.nextR}`
}

function emitNodes(nodes: Node[], parentTag: string | null, ctx: HtmlGenContext): string[] {
  const lines: string[] = []
  let inTBody = false
  for (const node of nodes) {
    if (node.type === 'text') {
      lines.push(renderInline(node.value))
      continue
    }
    if (node.type === 'fenced-code') {
      lines.push(`<pre><code class="language-${escapeAttr(node.language)}">${escapeHtml(node.code)}\n</code></pre>`)
      continue
    }
    if (node.type === 'sibling-item') {
      lines.push(...emitSiblingItem(node, parentTag, ctx))
      continue
    }
    if (node.type === 'void') {
      lines.push(...emitVoid(node, ctx))
      continue
    }
    if (node.type === 'control-if') {
      lines.push(...emitControlIf(node, parentTag, ctx))
      continue
    }
    if (node.type === 'control-for') {
      lines.push(...emitControlFor(node, parentTag, ctx))
      continue
    }
    if (node.type !== 'block') {
      continue
    }

    if (parentTag === 'table' && node.tag === 'row') {
      if (!inTBody) {
        lines.push('<tbody>')
        inTBody = true
      }
      lines.push(...emitTableRow(node, ctx))
      continue
    }

    lines.push(...emitBlock(node, parentTag, ctx))
  }
  if (inTBody) {
    lines.push('</tbody>')
  }
  return lines
}

function attrsHaveResponsiveOverrides(attrs: Attribute[]): boolean {
  for (const a of attrs) {
    if (a.overrides && a.overrides.length > 0) return true
  }
  return false
}

function parseMinWidthPx(bp: string): number {
  const m = /^(\d+(?:\.\d+)?)px$/u.exec(bp.trim())
  return m ? Number(m[1]) : 0
}

function buildGridResponsiveCss(attrs: Attribute[], id: string): string {
  const colsAttr = attrs.find((a) => a.key === 'cols' || a.key === 'columns')
  const gapAttr = attrs.find((a) => a.key === 'gap')
  const baseCols = colsAttr?.value ?? '1'
  const baseGap = gapAttr?.value ?? 'md'

  const colsByBp = new Map<string, string>()
  const gapByBp = new Map<string, string>()
  if (colsAttr?.overrides) {
    for (const o of colsAttr.overrides) {
      colsByBp.set(o.breakpoint, o.value)
    }
  }
  if (gapAttr?.overrides) {
    for (const o of gapAttr.overrides) {
      gapByBp.set(o.breakpoint, o.value)
    }
  }

  const allBps = new Set<string>([...colsByBp.keys(), ...gapByBp.keys()])
  const sorted = [...allBps].sort((a, b) => parseMinWidthPx(a) - parseMinWidthPx(b))

  let state = { cols: baseCols, gap: baseGap }
  const out: string[] = []
  out.push(`[data-jotl-r="${id}"] { --cols: ${state.cols}; --gap: ${state.gap}; }`)

  for (const bp of sorted) {
    const next = { ...state }
    if (colsByBp.has(bp)) next.cols = colsByBp.get(bp)!
    if (gapByBp.has(bp)) next.gap = gapByBp.get(bp)!
    const props: string[] = []
    if (next.cols !== state.cols) props.push(`--cols: ${next.cols}`)
    if (next.gap !== state.gap) props.push(`--gap: ${next.gap}`)
    state = next
    if (props.length > 0) {
      out.push(`@media (min-width: ${bp}) { [data-jotl-r="${id}"] { ${props.join('; ')}; } }`)
    }
  }
  return out.join('\n')
}

function emitBlock(node: BlockNode, parentTag: string | null, ctx: HtmlGenContext): string[] {
  const variants = node.variants

  if (node.tag === 'heading') {
    const level = sanitizeHeadingLevel(variants[0])
    return [
      `<h${level}${renderAttrs(node.attributes)}>${renderChildrenInlineCtx(node.children, node.tag, ctx)}</h${level}>`,
    ]
  }

  if (node.tag === 'text') {
    return [
      `<p${renderAttrs(node.attributes, { prependClasses: textVariantClasses(variants) })}>${renderChildrenInlineCtx(node.children, node.tag, ctx)}</p>`,
    ]
  }

  if (node.tag === 'list') {
    const { tag, listClass } = listTagAndClass(variants)
    const prepend = listClass ? [listClass] : []
    const lines = [`<${tag}${renderAttrs(node.attributes, { prependClasses: prepend })}>`]
    lines.push(...emitNodes(node.children, 'list', ctx))
    lines.push(`</${tag}>`)
    return lines
  }

  if (node.tag === 'button') {
    return [
      `<button${renderAttrs(node.attributes, { prependClasses: buttonVariantClasses(variants) })}>${renderChildrenInlineCtx(node.children, node.tag, ctx)}</button>`,
    ]
  }

  if (node.tag === 'nav') {
    const lines = [`<nav${renderAttrs(node.attributes)}>`]
    lines.push(...emitNodes(node.children, 'nav', ctx))
    lines.push('</nav>')
    return lines
  }

  if (node.tag === 'brand') {
    return [`<div class="jotl-brand">${renderChildrenInlineCtx(node.children, node.tag, ctx)}</div>`]
  }

  if (node.tag === 'links') {
    const lines = ['<ul>']
    lines.push(...emitNodes(node.children, 'links', ctx))
    lines.push('</ul>')
    return lines
  }

  if (node.tag === 'table') {
    const lines = ['<table>']
    lines.push(...emitNodes(node.children, 'table', ctx))
    lines.push('</table>')
    return lines
  }

  if (node.tag === 'columns') {
    const lines = ['<thead>', '<tr>']
    for (const child of node.children) {
      if (child.type !== 'sibling-item') continue
      const key = findAttribute(child.attributes, 'key') ?? ''
      const label = findAttribute(child.attributes, 'label') ?? ''
      lines.push(`<th data-key="${escapeAttr(key)}">${escapeHtml(label)}</th>`)
    }
    lines.push('</tr>', '</thead>')
    return lines
  }

  if (node.tag === 'row' && parentTag !== 'table') {
    return emitLayoutRow(node, ctx)
  }

  if (node.tag === 'field') {
    return [emitFieldFromAttrs(node.attributes)]
  }

  if (node.tag === 'image') {
    return [`<img${renderAttrs(mapImageAttrs(node.attributes))}>`]
  }

  if (node.tag === 'stack') {
    const lines = [`<div${renderDivClassAttrs(node.attributes, 'jotl-stack')}>`]
    lines.push(...emitNodes(node.children, node.tag, ctx))
    lines.push('</div>')
    return lines
  }

  if (node.tag === 'group') {
    const lines = [`<div${renderDivClassAttrs(node.attributes, 'jotl-group')}>`]
    lines.push(...emitNodes(node.children, node.tag, ctx))
    lines.push('</div>')
    return lines
  }

  if (node.tag === 'grid') {
    const responsive = attrsHaveResponsiveOverrides(node.attributes)
    if (responsive) {
      const id = nextResponsiveId(ctx)
      ctx.responsiveRules.push(buildGridResponsiveCss(node.attributes, id))
      const lines = [`<div class="jotl-grid" data-jotl-r="${id}">`]
      lines.push(...emitNodes(node.children, node.tag, ctx))
      lines.push('</div>')
      return lines
    }
    const lines = [`<div${renderDivClassAttrs(node.attributes, 'jotl-grid', true)}>`]
    lines.push(...emitNodes(node.children, node.tag, ctx))
    lines.push('</div>')
    return lines
  }

  if (node.tag === 'card') {
    const cardClasses = ['jotl-card', ...cardVariantClasses(variants)]
    const lines = [`<div${renderAttrs(node.attributes, { prependClasses: cardClasses })}>`]
    lines.push(...emitNodes(node.children, node.tag, ctx))
    lines.push('</div>')
    return lines
  }

  if (node.tag === 'block') {
    const lines = [`<div${renderAttrs(node.attributes)}>`]
    lines.push(...emitNodes(node.children, node.tag, ctx))
    lines.push('</div>')
    return lines
  }

  if (isKnownHtmlTag(node.tag)) {
    const htmlTag = node.tag
    if (node.children.some((child) => child.type === 'block' || child.type === 'void' || child.type === 'sibling-item' || child.type === 'fenced-code')) {
      const lines = [`<${htmlTag}${renderAttrs(node.attributes)}>`]
      lines.push(...emitNodes(node.children, node.tag, ctx))
      lines.push(`</${htmlTag}>`)
      return lines
    }
    return [`<${htmlTag}${renderAttrs(node.attributes)}>${renderChildrenInlineCtx(node.children, node.tag, ctx)}</${htmlTag}>`]
  }

  const unknownClasses = variants.length > 0 ? ` class="${escapeAttr(variants.join(' '))}"` : ''
  const customTag = `jotl-${node.tag}`
  if (node.children.some((c) => c.type === 'block' || c.type === 'void' || c.type === 'sibling-item' || c.type === 'fenced-code')) {
    const lines = [`<${customTag}${unknownClasses}${renderAttrs(node.attributes)}>`]
    lines.push(...emitNodes(node.children, node.tag, ctx))
    lines.push(`</${customTag}>`)
    return lines
  }
  return [`<${customTag}${unknownClasses}${renderAttrs(node.attributes)}>${renderChildrenInlineCtx(node.children, node.tag, ctx)}</${customTag}>`]
}

function emitControlIf(node: ControlIfNode, parentTag: string | null, ctx: HtmlGenContext): string[] {
  const lines: string[] = ['<div class="jotl-if" data-jotl-if>']
  for (const branch of node.branches) {
    const caseExpr = branch.condition ? transformExpression(branch.condition) : ''
    lines.push(`<template data-jotl-case="${escapeAttr(caseExpr)}">`)
    lines.push(...emitNodes(branch.children, parentTag, ctx))
    lines.push('</template>')
  }
  lines.push('</div>')
  return lines
}

function emitControlFor(node: ControlForNode, parentTag: string | null, ctx: HtmlGenContext): string[] {
  const iterable = transformExpression(node.iterable)
  const attrs = [
    `data-jotl-for="${escapeAttr(iterable)}"`,
    `data-jotl-item="${escapeAttr(node.item)}"`,
  ]
  if (node.index) attrs.push(`data-jotl-index="${escapeAttr(node.index)}"`)
  const lines = [`<div class="jotl-for" ${attrs.join(' ')}>`]
  lines.push('<template>')
  lines.push(...emitNodes(node.children, parentTag, ctx))
  lines.push('</template>')
  lines.push('</div>')
  return lines
}

/**
 * Rewrite sigil-prefixed references into runtime-evaluable JS expressions.
 * `&user.name` → `state.user.name`, `@save` → `handlers.save`,
 * `$item.title` → `$scope.item.title`. Operates on unquoted source; callers
 * must not pass expressions whose string literals contain these sigils.
 */
function transformExpression(input: string): string {
  return input
    .replaceAll(/(?<![\w.])&([a-zA-Z_][\w.]*)/gu, 'state.$1')
    .replaceAll(/(?<![\w.])@([a-zA-Z_][\w.]*)/gu, 'handlers.$1')
    .replaceAll(/(?<![\w.])\$([a-zA-Z_][\w.]*)/gu, '$scope.$1')
}

function isKnownHtmlTag(tag: string): boolean {
  return ['section', 'nav', 'header', 'footer', 'aside', 'main', 'article', 'form', 'button'].includes(tag)
}

function textVariantClasses(variants: string[]): string[] {
  const classes: string[] = []
  for (const v of variants) {
    if (v === 'body') continue
    if (['lead', 'muted', 'caption'].includes(v)) classes.push(v)
  }
  return classes
}

function listTagAndClass(variants: string[]): { tag: 'ul' | 'ol'; listClass?: string } {
  if (variants.includes('number')) return { tag: 'ol' }
  if (variants.includes('none')) return { tag: 'ul', listClass: 'list-none' }
  return { tag: 'ul' }
}

function buttonVariantClasses(variants: string[]): string[] {
  const classes: string[] = []
  for (const v of variants) {
    if (v === 'sm' || v === 'md' || v === 'lg') classes.push(`jotl-size-${v}`)
    else if (['primary', 'secondary', 'ghost', 'danger'].includes(v)) classes.push(v)
  }
  return classes
}

function cardVariantClasses(variants: string[]): string[] {
  return variants.filter((v) => ['elevated', 'bordered', 'flat'].includes(v))
}

function mapImageAttrs(attrs: Attribute[]): Attribute[] {
  const out: Attribute[] = []
  for (const a of attrs) {
    if (a.key === 'url') {
      out.push({ ...a, key: 'src' })
    } else {
      out.push(a)
    }
  }
  return out
}

function emitLayoutRow(node: BlockNode, ctx: HtmlGenContext): string[] {
  if (node.children.some((child) => child.type === 'sibling-item')) {
    return emitTableRow(node, ctx)
  }
  const lines = [`<div${renderDivClassAttrs(node.attributes, 'jotl-row')}>`]
  lines.push(...emitNodes(node.children, node.tag, ctx))
  lines.push('</div>')
  return lines
}

function emitTableRow(node: BlockNode, ctx: HtmlGenContext): string[] {
  const lines = ['<tr>']
  for (const child of node.children) {
    if (child.type !== 'sibling-item') continue
    lines.push(`<td>${renderChildrenInlineCtx(child.children, 'row', ctx)}</td>`)
  }
  lines.push('</tr>')
  return lines
}

function emitSiblingItem(node: SiblingItemNode, parentTag: string | null, ctx: HtmlGenContext): string[] {
  const inner = renderChildrenInlineCtx(node.children, parentTag, ctx)
  if (parentTag === 'list' || parentTag === 'links') {
    return [`<li>${inner}</li>`]
  }
  return [inner]
}

function emitVoid(node: VoidNode, ctx: HtmlGenContext): string[] {
  const { tag, attributes: attrs } = node
  if (tag === 'image') {
    const mapped = mapImageAttrs(attrs)
    const src = findAttribute(mapped, 'src') ?? ''
    const rest = renderAttrs(
      mapped.filter((a) => a.key !== 'src'),
      {},
    )
    return [`<img src="${escapeAttr(src)}"${rest}>`]
  }
  if (tag === 'field') {
    return [emitFieldFromAttrs(attrs)]
  }
  if (tag === 'break') {
    return ['<br>']
  }
  if (tag === 'divider') {
    return ['<hr>']
  }
  if (tag === 'spacer') {
    return [`<div${renderAttrs(attrs, { prependClasses: ['jotl-spacer'] })}></div>`]
  }
  if (tag === 'icon') {
    const name = findAttribute(attrs, 'name') ?? ''
    return [`<i class="icon" data-icon="${escapeAttr(name)}"></i>`]
  }
  return [`<!-- unknown void ${tag} -->`]
}

function emitFieldFromAttrs(attrs: Attribute[]): string {
  const fieldType = findAttribute(attrs, 'type') ?? 'text'
  const label = escapeHtml(findAttribute(attrs, 'label') ?? '')
  const name = findAttribute(attrs, 'name') ?? ''
  const passthrough = renderAttrs(attrs, {
    omit: ['type', 'label', 'style'],
    rename: { style: 'class' },
  })
  const controlAttrs = ` name="${escapeAttr(name)}"${passthrough.replace(` name="${escapeAttr(name)}"`, '')}`
  if (fieldType === 'textarea') {
    return `<label>${label}<textarea${controlAttrs}></textarea></label>`
  }
  if (fieldType === 'select') {
    return `<label>${label}<select${controlAttrs}></select></label>`
  }
  if (fieldType === 'checkbox' || fieldType === 'radio') {
    return `<label><input type="${escapeAttr(fieldType)}"${controlAttrs}>${label}</label>`
  }
  return `<label>${label}<input type="${escapeAttr(fieldType)}"${controlAttrs}></label>`
}

function renderChildrenInlineCtx(children: Node[], parentTag: string | null, ctx: HtmlGenContext): string {
  const parts: string[] = []
  for (const child of children) {
    if (child.type === 'text') {
      parts.push(renderInline(child.value))
    } else if (child.type === 'block') {
      parts.push(emitBlock(child, parentTag, ctx).join(''))
    } else if (child.type === 'void') {
      parts.push(emitVoid(child, ctx).join(''))
    } else if (child.type === 'sibling-item') {
      parts.push(renderChildrenInlineCtx(child.children, parentTag, ctx))
    } else if (child.type === 'fenced-code') {
      parts.push(`<pre><code class="language-${escapeAttr(child.language)}">${escapeHtml(child.code)}\n</code></pre>`)
    }
  }
  return normalizeInlineSpacing(parts.join(' ').trim())
}

function renderInline(input: string): string {
  const segments: string[] = []
  let i = 0
  while (i < input.length) {
    const start = input.indexOf('/>', i)
    if (start === -1) {
      segments.push(renderMarkdownish(input.slice(i)))
      break
    }
    if (start > i) {
      segments.push(renderMarkdownish(input.slice(i, start)))
    }
    const parsed = parseSlashInline(input, start)
    if (!parsed) {
      segments.push(escapeHtml(unescapeSigils(input[start]!)))
      i = start + 1
      continue
    }
    segments.push(parsed.html)
    i = parsed.end
  }
  return normalizeInlineSpacing(segments.join(''))
}

function parseSlashInline(s: string, start: number): { html: string; end: number } | null {
  if (s.slice(start, start + 2) !== '/>') return null
  let i = start + 2
  while (i < s.length && /\s/u.test(s[i]!)) i++
  const tagMatch = /^([a-zA-Z][\w-]*)/u.exec(s.slice(i))
  if (!tagMatch) return null
  const tag = tagMatch[1]!
  i += tagMatch[0]!.length
  while (i < s.length && /\s/u.test(s[i]!)) i++
  let attrs: Attribute[] = []
  if (s[i] === '[') {
    const close = s.indexOf(']', i)
    if (close === -1) return null
    attrs = parseAttributes(s.slice(i + 1, close))
    i = close + 1
  }
  while (i < s.length && /\s/u.test(s[i]!)) i++
  if (s[i] !== ':') return null
  i++
  let depth = 1
  const contentStart = i
  while (i < s.length && depth > 0) {
    if (s.slice(i, i + 2) === '/>') {
      depth += 1
      i += 2
      continue
    }
    if (s.slice(i, i + 2) === '</') {
      depth -= 1
      if (depth === 0) {
        const content = s.slice(contentStart, i)
        const html = renderInlineElementResult(tag, attrs, content)
        return { html, end: i + 2 }
      }
      i += 2
      continue
    }
    i++
  }
  return null
}

function renderInlineElementResult(tag: string, attrs: Attribute[], contentRaw: string): string {
  const content = renderInline(contentRaw.trim())
  if (tag === 'icon') {
    const name = findAttribute(attrs, 'name') ?? ''
    return `<i class="icon" data-icon="${escapeAttr(name)}"></i>`
  }
  if (tag === 'avatar') {
    return `<img class="jotl-avatar"${renderAttrs(attrs, { omit: ['style'], rename: { url: 'href' } })}>`
  }
  if (tag === 'badge') {
    const variant = attrs.length > 0 && attrs[0]?.boolean === false && attrs[0]?.key ? attrs[0].key : ''
    const color = findAttribute(attrs, 'color')
    const cls = color
      ? `jotl-badge jotl-badge-${color}`
      : variant
        ? `jotl-badge ${escapeAttr(variant)}`
        : 'jotl-badge'
    return `<span class="${cls}">${content}</span>`
  }
  if (tag === 'time') {
    return `<time${renderAttrs(attrs, { rename: { value: 'datetime' } })}>${content}</time>`
  }
  if (tag === 'strong' || tag === 'em' || tag === 'code') {
    return `<${tag}>${content}</${tag}>`
  }
  const htmlTag = mapInlineTag(tag)
  return `<${htmlTag}${renderAttrs(attrs, { rename: { url: 'href' } })}>${content}</${htmlTag}>`
}

function renderMarkdownish(input: string): string {
  const staticRe =
    /#(['"])(.*?)\1\s*\[([^\]]*)\]|(?<!\\)\*\*[^*]+\*\*|(?<!\\)_[^_]+(?<!\\)_|(?<!\\)`[^`]+`/gu
  const dynamicRe =
    /#(['"])(.*?)\1\s*\[([^\]]*)\]|(?<!\\)\*\*[^*]+\*\*|(?<!\\)_[^_]+(?<!\\)_|(?<!\\)`[^`]+`|(?<![\w\\])&[a-zA-Z_][\w.]*|(?<![\w\\])@[a-zA-Z_][\w.]*|(?<![\w\\])\$[a-zA-Z_][\w.]*|(?<!\\)\{[^{}]*\}/gu
  const tokenRe = activeDynamic ? dynamicRe : staticRe
  const segments: string[] = []
  let last = 0
  for (const match of input.matchAll(tokenRe)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > last) {
      segments.push(escapeHtml(unescapeSigils(input.slice(last, index))))
    }
    segments.push(renderMarkdownToken(token))
    last = index + token.length
  }
  if (last < input.length) {
    segments.push(escapeHtml(unescapeSigils(input.slice(last))))
  }
  return segments.join('')
}

function renderMarkdownToken(token: string): string {
  if (token.startsWith('#')) {
    const textMatch = /^#(['"])(.*?)\1\s*\[([^\]]*)\]$/u.exec(token)
    if (!textMatch) return escapeHtml(token)
    const text = textMatch[2] ?? ''
    const attrs = parseAttributes(textMatch[3] ?? '')
    return `<a${renderAttrs(attrs, { rename: { url: 'href' } })}>${escapeHtml(unescapeSigils(text))}</a>`
  }
  if (token.startsWith('**') && token.endsWith('**')) {
    return `<strong>${escapeHtml(unescapeSigils(token.slice(2, -2)))}</strong>`
  }
  if (token.startsWith('_') && token.endsWith('_')) {
    return `<em>${escapeHtml(unescapeSigils(token.slice(1, -1)))}</em>`
  }
  if (token.startsWith('`') && token.endsWith('`')) {
    return `<code>${escapeHtml(unescapeSigils(token.slice(1, -1)))}</code>`
  }
  if (activeDynamic && (token.startsWith('&') || token.startsWith('@') || token.startsWith('$'))) {
    const expr = transformExpression(token)
    return `<span data-jotl-text="${escapeAttr(expr)}"></span>`
  }
  if (activeDynamic && token.startsWith('{') && token.endsWith('}')) {
    const expr = transformExpression(token.slice(1, -1).trim())
    return `<span data-jotl-text="${escapeAttr(expr)}"></span>`
  }
  return escapeHtml(token)
}

function renderAttrs(
  attrs: Attribute[],
  options: {
    omit?: string[]
    rename?: Record<string, string>
    prependClasses?: string[]
  } = {},
): string {
  const classes: string[] = [...(options.prependClasses ?? [])]
  const parts: string[] = []
  let classInsertIndex: number | null = null
  const omitSet = new Set(options.omit ?? [])
  const rename = options.rename ?? {}

  for (const attr of attrs) {
    if (omitSet.has(attr.key)) continue
    if (attr.key === 'key' || attr.key === 'bind') continue
    if (attr.key.startsWith('on_')) {
      if (activeDynamic && attr.value !== undefined) {
        const eventName = attr.key.slice('on_'.length)
        const expr = transformExpression(attr.value)
        parts.push(`data-jotl-on-${escapeAttrKey(eventName)}="${escapeAttr(expr)}"`)
      }
      continue
    }
    if (activeDynamic && attr.value !== undefined && isDynamicValue(attr.value)) {
      const expr = attr.value.startsWith('{') && attr.value.endsWith('}')
        ? transformExpression(attr.value.slice(1, -1).trim())
        : transformExpression(attr.value)
      const boundName = rename[attr.key] ?? mapAttr(attr.key)
      parts.push(`data-jotl-bind-${escapeAttrKey(boundName)}="${escapeAttr(expr)}"`)
      continue
    }

    const key = rename[attr.key] ?? mapAttr(attr.key)
    if (attr.key === 'layout' && attr.value) {
      classes.push(`jotl-layout-${attr.value}`)
      classInsertIndex ??= parts.length
      continue
    }
    if (attr.key === 'gap' && attr.value) {
      classes.push(`jotl-gap-${attr.value}`)
      classInsertIndex ??= parts.length
      continue
    }
    if (attr.key === 'size' && attr.value) {
      classes.push(`jotl-size-${attr.value}`)
      classInsertIndex ??= parts.length
      continue
    }
    if (attr.key === 'align' && attr.value) {
      classes.push(`jotl-align-${attr.value}`)
      classInsertIndex ??= parts.length
      continue
    }
    if (attr.key === 'color' && attr.value) {
      classes.push(`jotl-color-${attr.value}`)
      classInsertIndex ??= parts.length
      continue
    }
    if ((attr.key === 'columns' || attr.key === 'cols') && attr.value) {
      classes.push(`jotl-cols-${attr.value}`)
      classInsertIndex ??= parts.length
      continue
    }

    if (key === 'class') {
      if (attr.value) {
        classes.push(attr.value)
        classInsertIndex ??= parts.length
      }
      continue
    }

    if (attr.boolean) {
      parts.push(key)
    } else if (attr.value !== undefined) {
      parts.push(`${key}="${escapeAttr(attr.value)}"`)
    }
  }

  if (classes.length > 0) {
    const classEntry = `class="${escapeAttr(normalizeInlineSpacing(classes.join(' ')))}"`
    if (classInsertIndex !== null && classInsertIndex <= parts.length) {
      parts.splice(classInsertIndex, 0, classEntry)
    } else {
      const typeIdx = parts.findIndex((p) => p.startsWith('type='))
      if (typeIdx >= 0) {
        parts.splice(typeIdx + 1, 0, classEntry)
      } else {
        parts.push(classEntry)
      }
    }
  }

  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

function renderDivClassAttrs(attrs: Attribute[], baseClass: string, addColsStyle = false): string {
  const classes = [baseClass]
  const remaining: Attribute[] = []
  let columns: string | undefined

  for (const attr of attrs) {
    if (attr.overrides && attr.overrides.length > 0) continue
    if (attr.key === 'style' && attr.value) {
      classes.push(attr.value)
      continue
    }
    if (attr.key === 'layout' && attr.value) {
      classes.push(`jotl-layout-${attr.value}`)
      continue
    }
    if (attr.key === 'gap' && attr.value) {
      classes.push(`jotl-gap-${attr.value}`)
      continue
    }
    if (attr.key === 'size' && attr.value) {
      classes.push(`jotl-size-${attr.value}`)
      continue
    }
    if (attr.key === 'align' && attr.value) {
      classes.push(`jotl-align-${attr.value}`)
      continue
    }
    if ((attr.key === 'columns' || attr.key === 'cols') && attr.value) {
      columns = attr.value
      classes.push(`jotl-cols-${attr.value}`)
      continue
    }
    remaining.push(attr)
  }

  const classPart = ` class="${escapeAttr(normalizeInlineSpacing(classes.join(' ')))}"`
  const rest = renderAttrs(remaining, { omit: ['style'] })
  const stylePart = addColsStyle && columns ? ` style="--cols: ${escapeAttr(columns)}"` : ''
  return `${classPart}${rest}${stylePart}`
}

function isDynamicValue(value: string): boolean {
  if (value.length === 0) return false
  const first = value[0]
  if (first === '&' || first === '@' || first === '$') return true
  if (first === '{' && value.endsWith('}')) return true
  return false
}

function escapeAttrKey(value: string): string {
  return value.replaceAll(/[^a-z0-9-]/giu, '-').toLowerCase()
}

function mapInlineTag(tag: string): string {
  if (tag === 'strong' || tag === 'em' || tag === 'code' || tag === 'span') return tag
  if (tag === 'link') return 'a'
  return 'span'
}

function mapAttr(key: string): string {
  if (key === 'style') return 'class'
  if (key === 'url') return 'href'
  if (key === 'value') return 'datetime'
  return key
}

function findAttribute(attrs: Attribute[], key: string): string | undefined {
  return attrs.find((attr) => attr.key === key)?.value
}

function sanitizeHeadingLevel(value: string | undefined): number {
  const parsed = Number(value ?? '1')
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 6) return 1
  return parsed
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;')
}

function unescapeSigils(value: string): string {
  return value.replaceAll(/\\([*_`&@$\[\]{}#|<>])/gu, '$1')
}

function normalizeInlineSpacing(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim()
}
