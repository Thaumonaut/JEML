import { exec } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { dirname, extname, relative, resolve } from 'node:path'
import chokidar from 'chokidar'
import { compile } from '../compiler/index'

export type ServeOptions = {
  port: number
  host: string
  open: boolean
}

const STATIC_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

export function serve(inputPath: string, options: ServeOptions): void {
  const cwd = process.cwd()
  const abs = resolve(cwd, inputPath)
  const staticRoots = [cwd, dirname(abs)]
  let html = ''
  let version = 0

  const clients: ServerResponse[] = []

  function notify(): void {
    const payload = `data: ${version}\n\n`
    for (const res of clients) {
      try {
        res.write(payload)
      } catch {
        /* ignore broken pipes */
      }
    }
  }

  function compileFile(): void {
    try {
      const source = readFileSync(abs, 'utf8')
      html = compile(source)
      version += 1
      notify()
      console.log(`[jeml] compiled (build ${version})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[jeml] compile error:', message)
      html = errorDocument(message)
      version += 1
      notify()
    }
  }

  compileFile()

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const host = req.headers.host ?? `${options.host}:${options.port}`
    const url = new URL(req.url ?? '/', `http://${host}`)

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
      res.write('retry: 2000\n\n')
      res.write(`data: ${version}\n\n`)
      clients.push(res)
      req.on('close', () => {
        const index = clients.indexOf(res)
        if (index >= 0) clients.splice(index, 1)
      })
      return
    }

    if (url.pathname === '/preview.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(previewShellPage())
      return
    }

    const staticFile = tryReadStaticFile(url.pathname, staticRoots)
    if (staticFile) {
      res.writeHead(200, {
        'Content-Type': staticFile.contentType,
        'Cache-Control': 'no-cache',
      })
      res.end(staticFile.body)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  })

  server.listen(options.port, options.host, () => {
    const url = `http://${options.host}:${options.port}/`
    console.log(`[jeml] watching ${abs}`)
    console.log(`[jeml] preview: ${url}`)
    if (options.open) {
      openBrowser(url)
    }
  })

  chokidar.watch(abs, { ignoreInitial: true }).on('all', () => {
    compileFile()
  })
}

function previewShellPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>JEML preview</title>
  <style>
    html, body { margin: 0; height: 100%; background: #111; }
    iframe { border: 0; width: 100%; height: 100vh; display: block; background: #fff; }
  </style>
</head>
<body>
  <iframe id="preview" title="Compiled HTML" src="/preview.html"></iframe>
  <script>
    const frame = document.getElementById('preview');
    const es = new EventSource('/events');
    es.onmessage = function () {
      frame.src = '/preview.html?t=' + Date.now();
    };
  </script>
</body>
</html>
`
}

function errorDocument(message: string): string {
  const safe = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>JEML compile error</title></head>
<body>
  <pre style="font-family: ui-monospace, monospace; padding: 1rem; white-space: pre-wrap;">${safe}</pre>
</body>
</html>
`
}

function tryReadStaticFile(
  pathname: string,
  roots: string[],
): { body: Buffer; contentType: string } | null {
  const rel = pathname.replace(/^\/+/u, '')
  if (!rel) return null

  for (const root of roots) {
    const rootResolved = resolve(root)
    const full = resolve(rootResolved, rel)
    const safeRel = relative(rootResolved, full)
    if (!safeRel || safeRel.startsWith('..') || resolve(rootResolved, safeRel) !== full) {
      continue
    }
    if (!existsSync(full) || !statSync(full).isFile()) continue

    const ext = extname(full).toLowerCase()
    const contentType = STATIC_TYPES[ext] ?? 'application/octet-stream'
    return { body: readFileSync(full), contentType }
  }
  return null
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin'
      ? `open ${JSON.stringify(url)}`
      : process.platform === 'win32'
        ? `start ${JSON.stringify(url)}`
        : `xdg-open ${JSON.stringify(url)}`
  exec(command, (error) => {
    if (error) {
      console.warn('[jeml] could not open browser:', error.message)
    }
  })
}
