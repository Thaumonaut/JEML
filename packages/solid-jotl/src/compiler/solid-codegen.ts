/**
 * AST → TSX codegen for solid-jotl. Lowers a parsed `.jot` document into a
 * TypeScript+JSX module that vite-plugin-solid can compile further.
 *
 * Goals:
 *  - Files with `>> component:` blocks emit one named export per component.
 *    The first declared component is also re-exported as `default` so the
 *    common `import Counter from './Counter.jot'` pattern works.
 *  - Files with no components but a top-level `>> document:` are wrapped as a
 *    single implicit `Default` component. This keeps backward compatibility
 *    with single-page `.jot` files.
 *  - File-level `>> script:` is emitted at module scope (shared across all
 *    component instances). Component-level `>> script:` runs per-mount.
 *  - File-level `>> style:` is injected once via the `ensureGlobalStyle`
 *    runtime helper. Component-level styles do the same in v1; scoped CSS
 *    lowering is deferred to the doc-mode pass.
 *  - `>> meta:` is currently a no-op outside of document-mode (which is the
 *    last to-do); leaving the directive in place is fine.
 */

import { parse } from 'jotl'
import type {
  Attribute,
  BlockNode,
  ComponentDirective,
  ControlForNode,
  ControlIfNode,
  DirectiveNode,
  DocumentDirective,
  ImportDirective,
  JotlDocument,
  MetaDirective,
  Node,
  PropsDirective,
  ScriptDirective,
  SiblingItemNode,
  StyleDirective,
  VoidNode,
} from 'jotl'
import { emptyImports, renderSolidImport, type SolidImports } from './prelude'
import { transpileSolidScript, type SignalSet } from './solid-transpile'

export type CompileOptions = {
  /** Optional source filename, used for diagnostics and stable style IDs. */
  filename?: string
  /**
   * How to lower `>> meta:` directives.
   *  - `'solid-meta'` (default): emit `<MetaProvider>` + `<Title>` / `<Meta>`
   *    components from the optional `solid-meta` peer.
   *  - `'noop'`: skip meta directives entirely (used as the fallback when
   *    the host project does not depend on `solid-meta`).
   *
   * The Vite plugin auto-detects which mode to use based on whether
   * `solid-meta` resolves from the project root, but you can override here
   * for tests or programmatic use.
   */
  meta?: 'solid-meta' | 'noop'
}

export type CompileResult = {
  /** TSX module source. */
  code: string
}

type EmitContext = {
  /** Solid primitives needed across the whole module. */
  imports: SolidImports
  /** ES `import` statements pulled from `>> import` directives and hoisted from scripts. */
  hoistedImports: Set<string>
  /** Named child-component identifiers known to be in scope (capitalized). */
  components: Set<string>
  /** Active signal set during codegen of a particular scope. */
  signals: SignalSet
  /** Counter for generating unique inline-style IDs. */
  styleCounter: { n: number }
  /** File path used for stable style IDs. */
  filename: string
  /** How to lower `>> meta:` directives. */
  metaMode: 'solid-meta' | 'noop'
  /** True if the module needs `solid-meta` imports. Set during emission. */
  usesSolidMeta: boolean
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const ast = parse(source)
  return compileAst(ast, options)
}

export function compileAst(ast: JotlDocument, options: CompileOptions = {}): CompileResult {
  const filename = options.filename ?? 'anonymous.jot'
  const ctx: EmitContext = {
    imports: emptyImports(),
    hoistedImports: new Set<string>(),
    components: new Set<string>(),
    signals: new Set<string>(),
    styleCounter: { n: 0 },
    filename,
    metaMode: options.meta ?? 'solid-meta',
    usesSolidMeta: false,
  }

  // 1. Pull import directives → real ES imports. Track imported PascalCase
  //    names so the codegen knows when to emit `<Foo />` instead of `<foo />`.
  for (const d of ast.directives) {
    if (d.type !== 'import') continue
    ctx.hoistedImports.add(renderImportDirective(d))
    for (const n of d.names) {
      if (/^[A-Z]/u.test(n)) ctx.components.add(n)
    }
  }

  // 2. Identify components vs implicit-document. We disallow mixing them in
  //    the same file — the structure is ambiguous otherwise.
  const componentDirectives = ast.directives.filter(
    (d): d is ComponentDirective => d.type === 'component',
  )
  const fileDocument = ast.directives.find(
    (d): d is DocumentDirective => d.type === 'document',
  )
  if (componentDirectives.length > 0 && fileDocument) {
    throw new Error(
      `${filename}: cannot mix top-level >> document with >> component blocks. Wrap the document in a >> component, or remove the components.`,
    )
  }

  // 3. Emit file-level script. This sets the module-scope signal-set, which
  //    is then inherited by every component script.
  const fileScript = ast.directives.find(
    (d): d is ScriptDirective => d.type === 'script',
  )
  let fileScriptCode = ''
  if (fileScript) {
    const r = transpileSolidScript(dedent(fileScript.body))
    fileScriptCode = r.code
    mergeImports(ctx.imports, r.imports)
    for (const s of r.declaredSignals) ctx.signals.add(s)
    for (const h of r.hoistedImports) ctx.hoistedImports.add(h)
  }

  // 4. Emit file-level styles via ensureGlobalStyle.
  const fileStyles: string[] = []
  for (const d of ast.directives) {
    if (d.type !== 'style') continue
    const styleEmit = renderStyleEnsure(d, ctx)
    if (styleEmit) fileStyles.push(styleEmit)
  }
  let needsEnsureStyleImport = fileStyles.length > 0

  // 5a. Collect file-level `>> meta:` directives. These contribute extra JSX
  //     to the default component when `solid-meta` is available; otherwise
  //     they are dropped (with a one-time warning emitted at compile time so
  //     the author knows to add the peer dep).
  const metaDirectives = ast.directives.filter((d): d is MetaDirective => d.type === 'meta')
  const metaJsx: string[] = []
  if (metaDirectives.length > 0) {
    if (ctx.metaMode === 'solid-meta') {
      ctx.usesSolidMeta = true
      for (const m of metaDirectives) metaJsx.push(...renderMetaTags(m))
    } else {
      // Stay quiet when there's nothing meaningful to lower, but warn when
      // the file actually carries metadata that the host project will lose.
      // eslint-disable-next-line no-console
      console.warn(
        `[solid-jotl] ${filename}: dropping >> meta directive — install \`solid-meta\` and pass meta: 'solid-meta' to opt in.`,
      )
    }
  }

  // 5b. Emit components.
  const componentEmissions: string[] = []
  let defaultExportName: string | null = null

  if (componentDirectives.length > 0) {
    for (let idx = 0; idx < componentDirectives.length; idx += 1) {
      const cd = componentDirectives[idx]!
      const emission = emitComponent(cd, ctx, {
        isDefault: idx === 0,
        injectMetaJsx: idx === 0 ? metaJsx : [],
      })
      componentEmissions.push(emission.code)
      if (emission.needsEnsureStyle) needsEnsureStyleImport = true
      if (emission.isDefault) defaultExportName = cd.name
    }
  } else if (fileDocument) {
    // Implicit single component named `Default`.
    const synthetic: ComponentDirective = {
      type: 'component',
      name: 'Default',
      attributes: [],
      directives: [fileDocument],
    }
    const emission = emitComponent(synthetic, ctx, { isDefault: true, injectMetaJsx: metaJsx })
    componentEmissions.push(emission.code)
    if (emission.needsEnsureStyle) needsEnsureStyleImport = true
    defaultExportName = 'Default'
  } else if (metaJsx.length > 0) {
    // Meta-only file: synthesize an empty Default component so the metadata
    // still has a mount point.
    const synthetic: ComponentDirective = {
      type: 'component',
      name: 'Default',
      attributes: [],
      directives: [{ type: 'document', children: [] } satisfies DocumentDirective],
    }
    const emission = emitComponent(synthetic, ctx, { isDefault: true, injectMetaJsx: metaJsx })
    componentEmissions.push(emission.code)
    if (emission.needsEnsureStyle) needsEnsureStyleImport = true
    defaultExportName = 'Default'
  }

  // 6. Assemble the module.
  const lines: string[] = []
  lines.push('/* eslint-disable */')
  lines.push('// AUTO-GENERATED by solid-jotl — do not edit.')
  const solidImport = renderSolidImport(ctx.imports)
  if (solidImport) lines.push(solidImport)
  if (needsEnsureStyleImport) {
    lines.push("import { ensureGlobalStyle as __jotlEnsureStyle } from 'solid-jotl/runtime'")
  }
  if (ctx.usesSolidMeta) {
    lines.push("import { MetaProvider as __JotlMetaProvider, Title as __JotlTitle, Meta as __JotlMeta, Link as __JotlLink } from 'solid-meta'")
  }
  for (const imp of ctx.hoistedImports) lines.push(imp)
  if (lines[lines.length - 1] !== '') lines.push('')

  if (fileScriptCode) {
    lines.push(fileScriptCode)
    lines.push('')
  }
  for (const s of fileStyles) {
    lines.push(s)
  }
  if (fileStyles.length > 0) lines.push('')

  for (const emission of componentEmissions) {
    lines.push(emission)
    lines.push('')
  }

  if (defaultExportName) {
    lines.push(`export default ${defaultExportName}`)
  }

  return { code: lines.join('\n').trimEnd() + '\n' }
}

/* ───────────────────────────── Component emission ───────────────────────────── */

type ComponentEmission = {
  code: string
  needsEnsureStyle: boolean
  isDefault: boolean
}

function emitComponent(
  cd: ComponentDirective,
  ctx: EmitContext,
  options: { isDefault: boolean; injectMetaJsx?: string[] },
): ComponentEmission {
  const injectMetaJsx = options.injectMetaJsx ?? []
  // A component is itself a directive list. Pull sub-directives out by type.
  const subDirectives = cd.directives
  const subProps = subDirectives.find((d): d is PropsDirective => d.type === 'props')
  const subScript = subDirectives.find((d): d is ScriptDirective => d.type === 'script')
  const subDocument = subDirectives.find((d): d is DocumentDirective => d.type === 'document')
  const subStyles = subDirectives.filter((d): d is StyleDirective => d.type === 'style')
  const subImports = subDirectives.filter((d): d is ImportDirective => d.type === 'import')

  // Spec: imports inside a component are file-scoped. Hoist them and warn.
  for (const imp of subImports) {
    ctx.hoistedImports.add(`/* hoisted from >> component ${cd.name} */ ${renderImportDirective(imp)}`)
    for (const n of imp.names) {
      if (/^[A-Z]/u.test(n)) ctx.components.add(n)
    }
  }

  // Allow other components in the file to be referenced without an import.
  // We do this AFTER the for-loop above but BEFORE codegen so the current
  // component's siblings resolve.
  // (We add cd.name itself too — components can be self-recursive.)
  ctx.components.add(cd.name)

  // Per-component style emission.
  let needsEnsureStyle = false
  const styleStatements: string[] = []
  for (const s of subStyles) {
    const stmt = renderStyleEnsure(s, ctx)
    if (stmt) {
      styleStatements.push(stmt)
      needsEnsureStyle = true
    }
  }

  // Per-component script — inherits file-level signals.
  let scriptCode = ''
  let componentSignals: SignalSet = new Set(ctx.signals)
  if (subScript) {
    const r = transpileSolidScript(dedent(subScript.body), { inheritedSignals: ctx.signals })
    scriptCode = r.code
    mergeImports(ctx.imports, r.imports)
    for (const s of r.declaredSignals) componentSignals.add(s)
    for (const h of r.hoistedImports) ctx.hoistedImports.add(h)
  }

  // Body JSX. We swap in the component-local signal set during emission so
  // that `&count` lowers correctly.
  const savedSignals = ctx.signals
  ctx.signals = componentSignals
  const childNodes = subDocument?.children ?? []
  let body = renderNodesAsJsx(childNodes, ctx)
  ctx.signals = savedSignals

  // Splice file-level <Title>/<Meta> tags into this component's tree, wrapped
  // in a MetaProvider so they actually take effect. We only do this for the
  // component that owns the meta directives (the default export).
  if (injectMetaJsx.length > 0) {
    const metaInner = injectMetaJsx.join('\n')
    const existing = body.trim().length > 0 ? body : ''
    const wrappedChildren = existing.length > 0
      ? `${metaInner}\n${existing}`
      : metaInner
    body = `<__JotlMetaProvider>\n${indent(wrappedChildren, '  ')}\n</__JotlMetaProvider>`
  }

  // Props are surfaced as a JSDoc typedef on the function itself rather than
  // as a real `interface` declaration. This keeps the emitted module valid
  // JavaScript (so Vite's SSR transform and Rollup's plain parser both
  // accept it) while still giving editors a structured props shape to use
  // for completion and hovers.
  const propsLines: string[] = []
  if (subProps) {
    const interior = indent(dedent(subProps.body).trim(), ' * ')
    propsLines.push('/**')
    propsLines.push(` * @typedef {Object} ${cd.name}Props`)
    propsLines.push(' *')
    propsLines.push(interior)
    propsLines.push(' */')
  }

  const usesProps = !!subProps || hasPropsReference(scriptCode, body)

  // The component function itself.
  const fnLines: string[] = []
  if (usesProps && subProps) {
    fnLines.push(`/** @param {${cd.name}Props} props */`)
  }
  fnLines.push(`export function ${cd.name}(${usesProps ? 'props' : ''}) {`)
  for (const s of styleStatements) fnLines.push(`  ${s}`)
  if (scriptCode) fnLines.push(indent(scriptCode, '  '))
  if (body.trim().length === 0) {
    fnLines.push('  return null')
  } else {
    fnLines.push('  return (')
    fnLines.push(indent(body, '    '))
    fnLines.push('  )')
  }
  fnLines.push('}')

  const code = [...propsLines, ...fnLines].join('\n')
  return { code, needsEnsureStyle, isDefault: options.isDefault }
}

function hasPropsReference(scriptCode: string, jsx: string): boolean {
  return /\bprops\b/u.test(scriptCode) || /\bprops\b/u.test(jsx)
}

/* ───────────────────────────── JSX emission ───────────────────────────── */

function renderNodesAsJsx(nodes: Node[], ctx: EmitContext): string {
  const rendered = nodes
    .map((n) => renderNodeAsJsx(n, ctx))
    .filter((s) => s.length > 0)
  if (rendered.length === 0) return ''
  if (rendered.length === 1) return rendered[0]!
  return `<>\n${rendered.map((r) => indent(r, '  ')).join('\n')}\n</>`
}

function renderNodeAsJsx(node: Node, ctx: EmitContext): string {
  switch (node.type) {
    case 'text':
      return renderInlineText(node.value, ctx)
    case 'block':
      return renderBlock(node, ctx)
    case 'void':
      return renderVoid(node, ctx)
    case 'sibling-item':
      return renderSiblingItem(node, ctx)
    case 'control-if':
      return renderControlIf(node, ctx)
    case 'control-for':
      return renderControlFor(node, ctx)
    case 'fenced-code':
      return `<pre><code class="language-${escapeAttr(node.language)}">{${JSON.stringify(node.code)}}</code></pre>`
    default:
      return ''
  }
}

function renderBlock(node: BlockNode, ctx: EmitContext): string {
  // Capitalized tag → child component reference. Vary the children layout
  // (text vs blocks) but keep the wrapper logic shared.
  if (/^[A-Z]/u.test(node.tag)) {
    const attrs = renderAttrs(node.attributes, ctx)
    const childContent = renderChildrenForElement(node.children, ctx)
    if (childContent.length === 0) return `<${node.tag}${attrs} />`
    return `<${node.tag}${attrs}>\n${indent(childContent, '  ')}\n</${node.tag}>`
  }

  const lowered = lowerBlockTag(node)
  const tag = lowered.tag
  const classes = lowered.prependClasses
  const attrs = renderAttrs(node.attributes, ctx, { prependClasses: classes })
  const childContent = renderChildrenForElement(node.children, ctx)
  if (childContent.length === 0) {
    return `<${tag}${attrs} />`
  }
  return `<${tag}${attrs}>\n${indent(childContent, '  ')}\n</${tag}>`
}

function renderChildrenForElement(children: Node[], ctx: EmitContext): string {
  const parts: string[] = []
  for (const child of children) {
    const piece = renderNodeAsJsx(child, ctx)
    if (piece.length > 0) parts.push(piece)
  }
  return parts.join('\n')
}

function renderVoid(node: VoidNode, ctx: EmitContext): string {
  if (node.tag === 'image') {
    const mapped = node.attributes.map((a) => (a.key === 'url' ? { ...a, key: 'src' } : a))
    return `<img${renderAttrs(mapped, ctx)} />`
  }
  if (node.tag === 'break') return '<br />'
  if (node.tag === 'divider') return '<hr />'
  if (node.tag === 'spacer') return `<div${renderAttrs(node.attributes, ctx, { prependClasses: ['jotl-spacer'] })} />`
  if (node.tag === 'icon') {
    const name = findAttr(node.attributes, 'name') ?? ''
    return `<i class="icon" data-icon="${escapeAttr(name)}" />`
  }
  if (node.tag === 'field') {
    return renderField(node.attributes, ctx)
  }
  return `{/* unknown void ${node.tag} */}`
}

function renderField(attrs: Attribute[], ctx: EmitContext): string {
  const fieldType = findAttr(attrs, 'type') ?? 'text'
  const label = findAttr(attrs, 'label') ?? ''
  const name = findAttr(attrs, 'name') ?? ''
  const passthrough = renderAttrs(
    attrs.filter((a) => a.key !== 'type' && a.key !== 'label'),
    ctx,
  )
  const labelEscaped = label.length > 0 ? escapeJsxText(label) : ''
  const labelOpen = `<label>${labelEscaped}`
  const labelClose = '</label>'
  const nameAttr = name.length > 0 ? ` name="${escapeAttr(name)}"` : ''
  if (fieldType === 'textarea') {
    return `${labelOpen}<textarea${nameAttr}${passthrough} />${labelClose}`
  }
  if (fieldType === 'select') {
    return `${labelOpen}<select${nameAttr}${passthrough} />${labelClose}`
  }
  if (fieldType === 'checkbox' || fieldType === 'radio') {
    return `<label><input type="${escapeAttr(fieldType)}"${nameAttr}${passthrough} />${labelEscaped}</label>`
  }
  return `${labelOpen}<input type="${escapeAttr(fieldType)}"${nameAttr}${passthrough} />${labelClose}`
}

function renderSiblingItem(node: SiblingItemNode, ctx: EmitContext): string {
  // Sibling items inside a list are wrapped as <li> by the parent renderer.
  // Without a list parent, we just splice the children in place.
  const children = renderChildrenForElement(node.children, ctx)
  return `<li${renderAttrs(node.attributes, ctx)}>${children ? `\n${indent(children, '  ')}\n` : ''}</li>`
}

function renderControlIf(node: ControlIfNode, ctx: EmitContext): string {
  // 1 branch with non-empty condition → <Show>. Otherwise → <Switch>/<Match>.
  if (node.branches.length === 1 && node.branches[0]!.condition) {
    ctx.imports.Show = true
    const branch = node.branches[0]!
    const cond = transformExpr(branch.condition, ctx)
    const inner = renderNodesAsJsx(branch.children, ctx)
    return `<Show when={${cond}}>\n${indent(inner, '  ')}\n</Show>`
  }
  ctx.imports.Switch = true
  const matches: string[] = []
  for (const b of node.branches) {
    if (b.condition) {
      const cond = transformExpr(b.condition, ctx)
      const inner = renderNodesAsJsx(b.children, ctx)
      matches.push(`<Match when={${cond}}>\n${indent(inner, '  ')}\n</Match>`)
    } else {
      // `~ else` — represent with `when={true}` as the final fallthrough.
      const inner = renderNodesAsJsx(b.children, ctx)
      matches.push(`<Match when={true}>\n${indent(inner, '  ')}\n</Match>`)
    }
  }
  return `<Switch>\n${indent(matches.join('\n'), '  ')}\n</Switch>`
}

function renderControlFor(node: ControlForNode, ctx: EmitContext): string {
  ctx.imports.For = true
  const each = transformExpr(node.iterable, ctx)
  const item = node.item
  const idx = node.index
  // Bind the iterator name so child expressions see it as a non-signal.
  const savedSignals = ctx.signals
  const localSignals = new Set(ctx.signals)
  // Make sure the iterator doesn't accidentally rewrite as a signal.
  localSignals.delete(item)
  if (idx) localSignals.delete(idx)
  ctx.signals = localSignals
  const body = renderNodesAsJsx(node.children, ctx)
  ctx.signals = savedSignals
  const params = idx ? `(${item}, ${idx})` : `(${item})`
  return `<For each={${each}}>{${params} => (\n${indent(body, '  ')}\n)}</For>`
}

/* ───────────────────────────── Inline text & expressions ───────────────────────────── */

const SIGIL_RE = /(?<![\w\\])&([a-zA-Z_][\w.]*)|(?<![\w\\])@([a-zA-Z_][\w.]*)|(?<![\w\\])\$([a-zA-Z_][\w.]*)|(?<!\\)\{([^{}]+)\}/gu

function renderInlineText(input: string, ctx: EmitContext): string {
  // Walk the string, splicing out `{expr}`, `&ref`, `@handler`, `$scope`
  // tokens. Surrounding plain text becomes JSX text; tokens become `{…}`
  // expression placeholders.
  const segments: string[] = []
  let last = 0
  for (const m of input.matchAll(SIGIL_RE)) {
    const idx = m.index ?? 0
    if (idx > last) {
      segments.push(jsxStaticText(input.slice(last, idx)))
    }
    if (m[1]) {
      // &ref
      segments.push(`{${refExpr(m[1], ctx)}}`)
    } else if (m[2]) {
      // @handler — inline reads of handlers are unusual; keep raw identifier.
      segments.push(`{${m[2]}}`)
    } else if (m[3]) {
      // $scope (loop iterator) — just the bare identifier.
      segments.push(`{${m[3]}}`)
    } else if (m[4]) {
      // {expression}
      segments.push(`{${transformExpr(m[4], ctx)}}`)
    }
    last = idx + m[0].length
  }
  if (last < input.length) {
    segments.push(jsxStaticText(input.slice(last)))
  }
  return segments.join('')
}

function jsxStaticText(s: string): string {
  // Escape `{` and `<` and `}` so JSX doesn't try to parse them. We do NOT
  // escape & because we want to allow real entities to pass through; if you
  // need a literal & you can write \&.
  return s
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('<', '&lt;')
}

function refExpr(name: string, ctx: EmitContext): string {
  // `&count` → `count()` if `count` is a signal in the current scope; else
  // pass through as `count` (a plain identifier — could be a prop, helper,
  // etc.).
  const root = name.split('.')[0] ?? name
  if (ctx.signals.has(root)) {
    if (name === root) return `${root}()`
    return `${root}()${name.slice(root.length)}`
  }
  return name
}

/**
 * Convert a JOTL expression — typically the body of `{…}`, an attribute
 * value, or an `~ if` condition — into a JS expression. Sigils get the same
 * treatment as inline text (`&` resolves through the signal-set). Dotted
 * paths after a signal pass through (e.g. `&user.name` → `user().name`).
 */
function transformExpr(input: string, ctx: EmitContext): string {
  return input.replaceAll(
    /(?<![\w.])&([a-zA-Z_][\w.]*)|(?<![\w.])@([a-zA-Z_][\w.]*)|(?<![\w.])\$([a-zA-Z_][\w.]*)/gu,
    (_match, amp, at, dollar) => {
      if (amp) return refExpr(amp, ctx)
      if (at) return at
      if (dollar) return dollar
      return _match
    },
  )
}

/* ───────────────────────────── Attribute rendering ───────────────────────────── */

const EVENT_ALIASES: Record<string, string> = {
  press: 'onClick',
  click: 'onClick',
  change: 'onChange',
  input: 'onInput',
  submit: 'onSubmit',
  focus: 'onFocus',
  blur: 'onBlur',
  hover: 'onMouseEnter',
  enter: 'onMouseEnter',
  leave: 'onMouseLeave',
  keydown: 'onKeyDown',
  keyup: 'onKeyUp',
}

function eventAttrName(jotlEvent: string): string {
  if (EVENT_ALIASES[jotlEvent]) return EVENT_ALIASES[jotlEvent]!
  // `key` → `onKey`, `mouseDown` → `onMouseDown`, etc.
  const camel = jotlEvent[0]!.toUpperCase() + jotlEvent.slice(1)
  return `on${camel}`
}

function renderAttrs(
  attrs: Attribute[],
  ctx: EmitContext,
  options: { prependClasses?: string[] } = {},
): string {
  const parts: string[] = []
  const classList: Record<string, string> = {} // condition expr → class name
  const classes: string[] = [...(options.prependClasses ?? [])]

  for (const a of attrs) {
    if (a.key === 'key') continue

    if (a.key.startsWith('on_')) {
      if (a.value === undefined) continue
      const evt = a.key.slice('on_'.length)
      const name = eventAttrName(evt)
      const expr = transformExpr(a.value, ctx)
      // Strip a leading `@` for the common form `[on_press=@handler]`.
      const rhs = expr.startsWith('@') ? expr.slice(1) : expr
      parts.push(`${name}={${rhs}}`)
      continue
    }

    // `class.active=&isOn` → classList entry.
    if (a.key.startsWith('class.') && a.value !== undefined) {
      const cls = a.key.slice('class.'.length)
      const expr = transformExpr(a.value, ctx)
      classList[cls] = expr
      continue
    }

    // `bind-value=&q` → `value={q()}`.
    if (a.key.startsWith('bind-') && a.value !== undefined) {
      const target = a.key.slice('bind-'.length)
      const expr = transformExpr(a.value, ctx)
      const rhs = expr.startsWith('&') ? refExpr(expr.slice(1), ctx) : expr
      parts.push(`${target}={${rhs}}`)
      continue
    }

    if (a.key === 'class' && a.value) {
      classes.push(a.value)
      continue
    }

    if (a.boolean) {
      parts.push(safeAttrKey(a.key))
      continue
    }
    if (a.value === undefined) continue

    if (isDynamicValue(a.value)) {
      const inner = a.value.startsWith('{') && a.value.endsWith('}')
        ? a.value.slice(1, -1).trim()
        : a.value
      const rhs = transformExpr(inner, ctx)
      const dropAmp = rhs.startsWith('&') ? refExpr(rhs.slice(1), ctx) : rhs
      parts.push(`${safeAttrKey(a.key)}={${dropAmp}}`)
      continue
    }

    parts.push(`${safeAttrKey(a.key)}="${escapeAttr(a.value)}"`)
  }

  if (classes.length > 0) {
    parts.push(`class="${escapeAttr(classes.join(' '))}"`)
  }
  if (Object.keys(classList).length > 0) {
    const inner = Object.entries(classList)
      .map(([k, v]) => `${JSON.stringify(k)}: ${v}`)
      .join(', ')
    parts.push(`classList={{ ${inner} }}`)
  }

  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

function safeAttrKey(key: string): string {
  // Most JOTL attr keys map 1:1 to JSX. `style` would conflict with React-
  // style style objects, but Solid accepts `style="..."` strings, so leave
  // it alone.
  return key
}

function isDynamicValue(v: string): boolean {
  return (
    v.startsWith('&') ||
    v.startsWith('@') ||
    v.startsWith('$') ||
    /^\{.*\}$/u.test(v)
  )
}

/* ───────────────────────────── Tag mapping ───────────────────────────── */

function lowerBlockTag(node: BlockNode): { tag: string; prependClasses: string[] } {
  const variants = node.variants
  switch (node.tag) {
    case 'heading': {
      const level = /^[1-6]$/u.test(variants[0] ?? '') ? variants[0]! : '1'
      return { tag: `h${level}`, prependClasses: [] }
    }
    case 'text':
      return { tag: 'p', prependClasses: variants.filter((v) => ['lead', 'muted', 'caption'].includes(v)) }
    case 'list':
      if (variants.includes('number')) return { tag: 'ol', prependClasses: [] }
      return { tag: 'ul', prependClasses: variants.includes('none') ? ['list-none'] : [] }
    case 'button':
      return { tag: 'button', prependClasses: variants.filter((v) => ['primary', 'secondary', 'ghost', 'danger', 'sm', 'md', 'lg'].includes(v)) }
    case 'group':
      return { tag: 'div', prependClasses: ['jotl-group'] }
    case 'stack':
      return { tag: 'div', prependClasses: ['jotl-stack'] }
    case 'grid':
      return { tag: 'div', prependClasses: ['jotl-grid'] }
    case 'card':
      return { tag: 'div', prependClasses: ['jotl-card', ...variants.filter((v) => ['elevated', 'bordered', 'flat'].includes(v))] }
    case 'block':
      return { tag: 'div', prependClasses: [] }
    case 'row':
      return { tag: 'div', prependClasses: ['jotl-row'] }
    case 'section':
    case 'nav':
    case 'header':
    case 'footer':
    case 'aside':
    case 'main':
    case 'article':
    case 'form':
      return { tag: node.tag, prependClasses: [] }
    default:
      return { tag: `jotl-${node.tag}`, prependClasses: variants }
  }
}

/* ───────────────────────────── Imports & styles ───────────────────────────── */

/**
 * Convert a single `>> meta [k=v ...]` directive into one or more JSX tags
 * from `solid-meta`. We special-case the small set of attributes that map to
 * dedicated solid-meta components; everything else falls through to a plain
 * `<Meta name="..." content="..." />`.
 *
 * Note: the JOTL attribute parser only accepts identifiers matching
 * `[a-zA-Z_][\w-]*`, so `og:title`-style namespaces aren't directly
 * expressible. Authors who need OpenGraph or Twitter cards can use
 * `og_title`, `og_image`, `twitter_card`, etc.; we strip the underscore
 * prefix and rewrite as `og:` / `twitter:` so the emitted markup matches
 * what crawlers expect.
 */
function renderMetaTags(d: MetaDirective): string[] {
  const out: string[] = []
  for (const a of d.attributes) {
    if (a.value === undefined) continue
    const value = escapeAttr(a.value)
    const key = a.key
    if (key === 'title') {
      out.push(`<__JotlTitle>${escapeJsxText(a.value)}</__JotlTitle>`)
      continue
    }
    if (key === 'icon' || key === 'favicon') {
      out.push(`<__JotlLink rel="icon" href="${value}" />`)
      continue
    }
    if (key === 'canonical') {
      out.push(`<__JotlLink rel="canonical" href="${value}" />`)
      continue
    }
    if (key === 'charset') {
      out.push(`<__JotlMeta charset="${value}" />`)
      continue
    }
    if (key === 'viewport') {
      out.push(`<__JotlMeta name="viewport" content="${value}" />`)
      continue
    }
    if (key.startsWith('og_')) {
      out.push(`<__JotlMeta property="og:${key.slice(3)}" content="${value}" />`)
      continue
    }
    if (key.startsWith('twitter_')) {
      out.push(`<__JotlMeta name="twitter:${key.slice('twitter_'.length)}" content="${value}" />`)
      continue
    }
    out.push(`<__JotlMeta name="${key}" content="${value}" />`)
  }
  return out
}

function renderImportDirective(d: ImportDirective): string {
  const from = JSON.stringify(d.from)
  if (d.kind === 'default') return `import ${d.names[0] ?? ''} from ${from}`
  if (d.kind === 'named') return `import { ${d.names.join(', ')} } from ${from}`
  return `import * as ${d.names[0] ?? ''} from ${from}`
}

function renderStyleEnsure(d: StyleDirective, ctx: EmitContext): string | null {
  // `>> style [preset=...]` is HTML-mode only and has no equivalent in Solid;
  // we silently ignore it.
  if (d.body === undefined || d.body.trim().length === 0) return null
  ctx.styleCounter.n += 1
  const id = `__jotlStyle_${stableId(ctx.filename)}_${ctx.styleCounter.n}`
  const css = JSON.stringify(d.body.trim())
  return `__jotlEnsureStyle(${JSON.stringify(id)}, ${css})`
}

function stableId(filename: string): string {
  // Crude but deterministic: take the basename and strip non-word chars.
  const base = filename.split(/[\\/]/).pop() ?? filename
  return base.replace(/[^A-Za-z0-9]/gu, '_')
}

/* ───────────────────────────── Misc ───────────────────────────── */

function findAttr(attrs: Attribute[], key: string): string | undefined {
  const a = attrs.find((x) => x.key === key)
  return a?.value
}

function escapeAttr(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function escapeJsxText(s: string): string {
  return s.replaceAll('<', '&lt;').replaceAll('{', '&#123;').replaceAll('}', '&#125;')
}

function indent(s: string, prefix: string): string {
  if (s.length === 0) return s
  return s
    .split('\n')
    .map((line) => (line.length > 0 ? prefix + line : line))
    .join('\n')
}

/**
 * Strip the common leading whitespace from every non-empty line. The JOTL
 * script body retains the indentation of its enclosing `>> script:` block,
 * which would otherwise leak into the generated component body.
 */
function dedent(s: string): string {
  const lines = s.split('\n')
  let min = Infinity
  for (const line of lines) {
    if (line.trim().length === 0) continue
    const m = /^(\s*)/u.exec(line)
    const len = m?.[1]?.length ?? 0
    if (len < min) min = len
  }
  if (!isFinite(min) || min === 0) return s
  return lines.map((line) => (line.length >= min ? line.slice(min) : line)).join('\n')
}

function mergeImports(target: SolidImports, src: SolidImports): void {
  target.createSignal ||= src.createSignal
  target.createEffect ||= src.createEffect
  target.createMemo ||= src.createMemo
  target.createResource ||= src.createResource
  target.Show ||= src.Show
  target.Switch ||= src.Switch
  target.For ||= src.For
}

// Re-export DirectiveNode helpers for the test harness.
export type { JotlDocument, DirectiveNode } from 'jotl'
