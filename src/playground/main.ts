import { compile } from '../compiler'
import { parse } from '../parser/parser'

const starter = `>> document:
  > heading.1: Hello, world <
<< document
`

const sourceEl = document.querySelector<HTMLTextAreaElement>('#source')
const htmlEl = document.querySelector<HTMLElement>('#html')
const astEl = document.querySelector<HTMLElement>('#ast')
const previewEl = document.querySelector<HTMLIFrameElement>('#preview')

if (!sourceEl || !htmlEl || !astEl || !previewEl) {
  throw new Error('Playground elements not found.')
}

const source = sourceEl
const html = htmlEl
const ast = astEl
const preview = previewEl

source.value = starter

function render(): void {
  try {
    const sourceText = source.value
    const astData = parse(sourceText)
    const htmlData = compile(sourceText)
    ast.textContent = JSON.stringify(astData, null, 2)
    html.textContent = htmlData
    preview.srcdoc = htmlData
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ast.textContent = `Parser error: ${message}`
    html.textContent = ''
    preview.srcdoc = ''
  }
}

source.addEventListener('input', render)
render()
