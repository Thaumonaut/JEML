#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compile } from './compiler/index'
import { serve } from './cli/serve'

function printHelp(): void {
  console.log(`jotl — compile JOTL to HTML

Usage:
  jotl compile <input.jot> [options]
  jotl serve <input.jot> [options]   (alias: server)

compile options:
  -o, --output <file>   Write HTML to this file (default: stdout)

serve options:
  --host <addr>         Bind address (default: 127.0.0.1)
  --port <n>            Port (default: 3847)
  --open                Open the preview in your default browser

Global:
  -h, --help            Show this help

Examples:
  jotl compile page.jot -o page.html
  jotl serve page.jot --open
`)
}

function main(): void {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printHelp()
    process.exit(argv.length === 0 ? 1 : 0)
  }

  const command = argv[0]
  if (command === 'serve' || command === 'server') {
    runServe(argv.slice(1))
    return
  }
  if (command !== 'compile') {
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
  }

  const inputPath = argv[1]
  if (!inputPath) {
    console.error('Missing input file.')
    printHelp()
    process.exit(1)
  }

  let outPath: string | undefined
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i] ?? ''
    if (arg === '-o' || arg === '--output') {
      outPath = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`)
      process.exit(1)
    }
  }

  const abs = resolve(process.cwd(), inputPath)
  const source = readFileSync(abs, 'utf8')
  const html = compile(source)

  if (outPath) {
    writeFileSync(resolve(process.cwd(), outPath), html, 'utf8')
  } else {
    process.stdout.write(html)
    if (!html.endsWith('\n')) process.stdout.write('\n')
  }
}

function runServe(args: string[]): void {
  const inputPath = args[0]
  if (!inputPath) {
    console.error('Missing input file for serve.')
    printHelp()
    process.exit(1)
  }

  let host = '127.0.0.1'
  let port = 3847
  let open = false

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i] ?? ''
    if (arg === '--host') {
      host = args[i + 1] ?? host
      i += 1
      continue
    }
    if (arg === '--port') {
      const raw = args[i + 1]
      if (raw === undefined) {
        console.error('Missing value for --port')
        process.exit(1)
      }
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        console.error('Invalid --port')
        process.exit(1)
      }
      port = parsed
      i += 1
      continue
    }
    if (arg === '--open') {
      open = true
      continue
    }
    if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`)
      process.exit(1)
    }
  }

  serve(inputPath, { host, port, open })
}

main()
