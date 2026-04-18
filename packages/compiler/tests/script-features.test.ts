import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '../src/compiler'
import { parse } from '../src/parser/parser'
import { transpileScript } from '../src/compiler/targets/typescript/transpile'

const fixturesDir = join(process.cwd(), 'tests/fixtures')

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8')
}

describe('script directive', () => {
  it('parses >> script body and preserves source fidelity in AST', () => {
    const ast = parse(fixture('script-counter.jeml'))
    const script = ast.directives.find((d) => d.type === 'script')
    expect(script).toBeDefined()
    expect(script && script.type === 'script' && script.body).toContain('let count = 0')
    expect(script && script.type === 'script' && script.body).toContain('increment ()')
  })

  it('emits a runtime-backed <script> tag with transpiled state and handlers', () => {
    const html = compile(fixture('script-counter.jeml'))
    expect(html).toContain('<script>')
    expect(html).toContain('state.count = 0')
    expect(html).toContain('handlers.increment = function')
    expect(html).toContain('state.count = state.count + 1')
    expect(html).toContain('handlers.reset = function')
  })

  it('rewrites &ref in text to a data-jeml-text placeholder', () => {
    const html = compile(fixture('script-counter.jeml'))
    expect(html).toContain('data-jeml-text="state.count"')
  })

  it('rewrites on_press to a data-jeml-on-press binding', () => {
    const html = compile(fixture('script-counter.jeml'))
    expect(html).toContain('data-jeml-on-press="handlers.increment"')
    expect(html).toContain('data-jeml-on-press="handlers.reset"')
  })
})

describe('control flow', () => {
  it('emits a jeml-if container with case templates', () => {
    const html = compile(fixture('control-flow.jeml'))
    expect(html).toContain('class="jeml-if" data-jeml-if')
    expect(html).toContain('data-jeml-case="state.show_admin"')
    expect(html).toContain('data-jeml-case=""')
  })

  it('emits a jeml-for container with body template and scope metadata', () => {
    const html = compile(fixture('control-flow.jeml'))
    expect(html).toContain('class="jeml-for"')
    expect(html).toContain('data-jeml-for="state.items"')
    expect(html).toContain('data-jeml-item="item"')
    expect(html).toContain('data-jeml-text="$scope.item"')
  })
})

describe('imports', () => {
  it('parses default, named, and namespace forms', () => {
    const ast = parse(fixture('imports.jeml'))
    const imports = ast.directives.filter((d) => d.type === 'import')
    expect(imports).toHaveLength(3)
    if (imports[0]?.type === 'import') {
      expect(imports[0].kind).toBe('default')
      expect(imports[0].names).toEqual(['Avatar'])
    }
    if (imports[1]?.type === 'import') {
      expect(imports[1].kind).toBe('named')
      expect(imports[1].names).toEqual(['format_date', 'format_money'])
    }
    if (imports[2]?.type === 'import') {
      expect(imports[2].kind).toBe('namespace')
      expect(imports[2].names).toEqual(['util'])
    }
  })

  it('skips .jeml imports with a comment until the resolver lands', () => {
    const html = compile(fixture('imports.jeml'))
    expect(html).toContain('import of "./components/avatar.jeml"')
    expect(html).toContain('skipped')
  })
})

describe('transpileScript', () => {
  it('rewrites top-level let into state assignments', () => {
    const { code, stateNames } = transpileScript('let count = 0\nlet name = "Ada"\n')
    expect(stateNames.sort()).toEqual(['count', 'name'])
    expect(code).toContain('state.count = 0')
    expect(code).toContain('state.name = "Ada"')
  })

  it('rewrites handler declarations and state references inside handlers', () => {
    const { code, handlerNames } = transpileScript(
      'let count = 0\nincrement () { count = count + 1 }\n',
    )
    expect(handlerNames).toEqual(['increment'])
    const compact = code.replace(/\s+/gu, ' ').trim()
    expect(compact).toContain('handlers.increment = function()')
    expect(compact).toContain('state.count = state.count + 1')
  })

  it('does not rewrite property accesses that happen to match a state name', () => {
    const { code } = transpileScript('let x = 0\nfn () { obj.x = 1 }\n')
    expect(code).toContain('obj.x = 1')
    expect(code).not.toContain('obj.state.x')
  })

  it('leaves const declarations alone', () => {
    const { code, stateNames } = transpileScript('const MAX = 10\n')
    expect(stateNames).toEqual([])
    expect(code).toContain('const MAX = 10')
  })

  it('treats top-level var the same as let (reactive state)', () => {
    const { code, stateNames } = transpileScript('var count = 0\nvar name = "Ada"\n')
    expect(stateNames.sort()).toEqual(['count', 'name'])
    expect(code).toContain('state.count = 0')
    expect(code).toContain('state.name = "Ada"')
    expect(code).not.toContain('var count')
    expect(code).not.toContain('var name')
  })

  it('still registers var references inside handlers', () => {
    const { code, stateNames, handlerNames } = transpileScript(
      'var count = 0\nbump () { count = count + 1 }\n',
    )
    expect(stateNames).toEqual(['count'])
    expect(handlerNames).toEqual(['bump'])
    const compact = code.replace(/\s+/gu, ' ').trim()
    expect(compact).toContain('state.count = state.count + 1')
  })

  it('leaves var declarations inside function bodies alone', () => {
    const { code } = transpileScript('fn () { var local = 1; return local }\n')
    const compact = code.replace(/\s+/gu, ' ').trim()
    expect(compact).toContain('var local = 1')
    expect(compact).not.toContain('state.local')
  })
})
