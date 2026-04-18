import { generateHtml } from './html-codegen'
import { parse } from '../parser/parser'

export function compile(source: string): string {
  const ast = parse(source)
  return generateHtml(ast)
}
