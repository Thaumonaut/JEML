import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '../src/index'

const examplesDir = join(__dirname, 'examples')
const expectedDir = join(__dirname, 'expected')

const UPDATE_FIXTURES = process.env.UPDATE_FIXTURES === '1'

describe('solid codegen — fixture snapshots', () => {
  const fixtures = readdirSync(examplesDir).filter((f) => f.endsWith('.jot'))
  for (const fixture of fixtures) {
    it(`compiles ${fixture}`, () => {
      const source = readFileSync(join(examplesDir, fixture), 'utf8')
      const { code } = compile(source, { filename: fixture })
      const expectedPath = join(expectedDir, fixture.replace(/\.jot$/, '.tsx'))

      if (UPDATE_FIXTURES || !existsSync(expectedPath)) {
        writeFileSync(expectedPath, code)
      }

      const expected = readFileSync(expectedPath, 'utf8')
      expect(code).toBe(expected)
    })
  }
})

describe('solid codegen — meta mode', () => {
  const source = `
>> meta [title="Hello" description="A page"]

>> document:
  > heading.1: Hello <
<< document
`.trim()

  it('emits solid-meta tags by default', () => {
    const { code } = compile(source, { filename: 'meta.jot' })
    expect(code).toContain("from 'solid-meta'")
    expect(code).toContain('<__JotlMetaProvider>')
    expect(code).toContain('<__JotlTitle>Hello</__JotlTitle>')
    expect(code).toContain('<__JotlMeta name="description" content="A page" />')
  })

  it('drops meta and warns when meta: noop', () => {
    const warns: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => warns.push(args.join(' '))
    try {
      const { code } = compile(source, { filename: 'meta.jot', meta: 'noop' })
      expect(code).not.toContain('solid-meta')
      expect(code).not.toContain('__JotlMetaProvider')
      expect(warns.some((w) => w.includes('>> meta directive'))).toBe(true)
    } finally {
      console.warn = orig
    }
  })
})

describe('solid codegen — error cases', () => {
  it('rejects mixing top-level >> document with >> component blocks', () => {
    const source = `
>> document:
  > text: Hello <
<< document

>> component Foo:
  >> document:
    > text: Hi <
  << document
<< component
`.trim()
    expect(() => compile(source, { filename: 'mixed.jot' })).toThrow(/cannot mix/u)
  })
})
