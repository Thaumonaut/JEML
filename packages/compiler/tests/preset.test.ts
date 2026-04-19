import { describe, expect, it } from 'vitest'
import { compile } from '../src/compiler'
import { parse } from '../src/parser/parser'
import { BASE_CSS } from '../src/compiler/preset-styles'

const HELLO = `>> document:
  > heading.1: Hello <
<< document
`

const HELLO_OPT_OUT = `>> style [preset=none]

>> document:
  > heading.1: Hello <
<< document
`

const HELLO_OPT_IN = `>> style [preset=base]

>> document:
  > heading.1: Hello <
<< document
`

const HELLO_OVERRIDE = `>> style: {
  :root { --jotl-lk-1: #ff6f3c; }
}

>> document:
  > heading.1: Hello <
<< document
`

describe('preset injection', () => {
  it('exposes a non-empty BASE_CSS string', () => {
    expect(typeof BASE_CSS).toBe('string')
    expect(BASE_CSS.length).toBeGreaterThan(1000)
    expect(BASE_CSS).toContain(':root')
    expect(BASE_CSS).toContain('--jotl-lk-1')
    expect(BASE_CSS).toContain('.jotl-card')
  })

  it('auto-injects the preset when no opt-out is present', () => {
    const html = compile(HELLO)
    expect(html).toContain('<style data-jotl-preset="base">')
    expect(html).toContain('--jotl-lk-1')
    expect(html).toContain('.jotl-grid')
  })

  it('honors >> style [preset=none] and skips injection', () => {
    const html = compile(HELLO_OPT_OUT)
    expect(html).not.toContain('data-jotl-preset')
    expect(html).not.toContain('--jotl-lk-1')
    expect(html).not.toContain('<style')
  })

  it('treats >> style [preset=base] as an explicit no-op against the default', () => {
    const explicit = compile(HELLO_OPT_IN)
    const implicit = compile(HELLO)
    expect(explicit).toEqual(implicit)
  })

  it('injects the preset block before any author <style> blocks (override semantics)', () => {
    const html = compile(HELLO_OVERRIDE)
    const presetIdx = html.indexOf('data-jotl-preset="base"')
    const authorIdx = html.indexOf('--jotl-lk-1: #ff6f3c')
    expect(presetIdx).toBeGreaterThan(-1)
    expect(authorIdx).toBeGreaterThan(presetIdx)
  })

  it('injects the preset before <link> stylesheets so authors win the cascade', () => {
    const src = `>> style [ref="/site.css"]\n\n>> document:\n  > heading.1: Hi <\n<< document\n`
    const html = compile(src)
    const presetIdx = html.indexOf('data-jotl-preset="base"')
    const linkIdx = html.indexOf('href="/site.css"')
    expect(presetIdx).toBeGreaterThan(-1)
    expect(linkIdx).toBeGreaterThan(presetIdx)
  })

  it('still emits a <link> when a single style directive combines preset=none and ref', () => {
    const src = `>> style [preset=none ref="/site.css"]\n\n>> document:\n  > heading.1: Hi <\n<< document\n`
    const html = compile(src)
    expect(html).not.toContain('data-jotl-preset')
    expect(html).toContain('<link rel="stylesheet" href="/site.css">')
  })

  it('emits no empty <style> tag for a bare >> style [preset=none] directive', () => {
    const html = compile(HELLO_OPT_OUT)
    expect(html).not.toMatch(/<style>\s*<\/style>/u)
  })

  it('parser preserves the preset attribute as a regular attribute', () => {
    const ast = parse(HELLO_OPT_OUT)
    const styleDirective = ast.directives.find((d) => d.type === 'style')
    expect(styleDirective).toBeDefined()
    const preset = styleDirective?.attributes.find((a) => a.key === 'preset')
    expect(preset?.value).toBe('none')
  })

  it('a single preset=none anywhere in the document wins over preset=base', () => {
    const src = `>> style [preset=base]\n>> style [preset=none]\n\n>> document:\n  > heading.1: Hi <\n<< document\n`
    const html = compile(src)
    expect(html).not.toContain('data-jotl-preset')
  })
})
