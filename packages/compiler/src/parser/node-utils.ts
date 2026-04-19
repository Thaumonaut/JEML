import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from './parser'
import type { JotlDocument } from './ast'

export function parseFromFile(path: string): JotlDocument {
  return parse(readFileSync(path, 'utf8'))
}

export function getGrammarSource(): string {
  return readFileSync(join(process.cwd(), 'src/grammar/jotl.pegjs'), 'utf8')
}
