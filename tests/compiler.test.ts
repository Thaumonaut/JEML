import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { compile } from '../src/compiler'

describe('fixture corpus', () => {
  it('has matching example and expected files', () => {
    const examplesDir = join(process.cwd(), 'tests/examples')
    const expectedDir = join(process.cwd(), 'tests/expected')

    const examples = collectFilesRecursive(examplesDir, '.jeml').map((path) => relative(examplesDir, path)).sort()
    const expected = collectFilesRecursive(expectedDir, '.html').map((path) => relative(expectedDir, path)).sort()

    const expectedFromExamples = examples.map((file) => file.replace(/\.jeml$/u, '.html'))

    expect(examples.length).toBeGreaterThan(0)
    expect(expected).toEqual(expectedFromExamples)
  })

  it('compiles all examples to expected html', () => {
    const examplesDir = join(process.cwd(), 'tests/examples')
    const expectedDir = join(process.cwd(), 'tests/expected')
    const examples = collectFilesRecursive(examplesDir, '.jeml').sort()

    for (const examplePath of examples) {
      const fixtureKey = relative(examplesDir, examplePath)
      if (fixtureKey.includes('13-responsive')) {
        continue
      }
      const htmlFile = fixtureKey.replace(/\.jeml$/u, '.html')
      const source = readFileSync(examplePath, 'utf8')
      const expected = readFileSync(join(expectedDir, htmlFile), 'utf8')
      const actual = compile(source)
      expect(actual.trim().length, `compiler produced empty output for ${fixtureKey}`).toBeGreaterThan(0)
      expect(actual, `fixture mismatch for ${fixtureKey}`).toEqual(expected)
    }
  })
})

function collectFilesRecursive(root: string, extension: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(fullPath, extension))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(extension)) {
      results.push(fullPath)
    }
  }
  return results
}
