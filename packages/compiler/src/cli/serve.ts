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

type SplitOutput = {
  html: string
  script: string
  styles: string
}

export function serve(inputPath: string, options: ServeOptions): void {
  const cwd = process.cwd()
  const abs = resolve(cwd, inputPath)
  const staticRoots = [cwd, dirname(abs)]
  let split: SplitOutput = { html: '', script: '', styles: '' }
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
      const compiled = compile(source)
      split = splitDocument(compiled)
      version += 1
      notify()
      console.log(`[jotl] compiled (build ${version})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[jotl] compile error:', message)
      split = { html: errorDocument(message), script: '', styles: '' }
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

    if (url.pathname === '/__jotl/runtime.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      res.end(split.script)
      return
    }

    if (url.pathname === '/__jotl/styles.css') {
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      res.end(split.styles)
      return
    }

    if (url.pathname === '/__jotl/livereload.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      })
      res.end(LIVE_RELOAD_SCRIPT)
      return
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(split.html)
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
    console.log(`[jotl] watching ${abs}`)
    console.log(`[jotl] preview: ${url}`)
    if (options.open) {
      openBrowser(url)
    }
  })

  chokidar.watch(abs, { ignoreInitial: true }).on('all', () => {
    compileFile()
  })
}

const LIVE_RELOAD_SCRIPT = `(function(){
  if (typeof EventSource === "undefined") return;
  var es = new EventSource("/events");
  var first = true;
  es.onmessage = function () {
    if (first) { first = false; return; }
    location.reload();
  };
})();
`

/**
 * Pull inline <script> and <style> tags out of the compiled HTML and
 * replace them with linked references to endpoints the dev server owns.
 * Also injects a tiny livereload client. The compiler output itself
 * remains a single portable file — this rewrite is dev-server only.
 */
function splitDocument(compiled: string): SplitOutput {
  let html = compiled
  let script = ''
  const styles: string[] = []

  html = html.replace(
    /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gu,
    (match, attrs: string | undefined, body: string) => {
      if (attrs && (/\ssrc\s*=/u.test(attrs) || /\stype\s*=\s*["']importmap["']/u.test(attrs))) {
        return match
      }
      script += `${body}\n`
      return ''
    },
  )

  let firstStyleReplaced = false
  html = html.replace(
    /<style(\s[^>]*)?>([\s\S]*?)<\/style>/gu,
    (_match, _attrs, body: string) => {
      styles.push(body)
      if (firstStyleReplaced) return ''
      firstStyleReplaced = true
      return '<link rel="stylesheet" href="/__jotl/styles.css">'
    },
  )

  const injections: string[] = []
  if (script.trim().length > 0) {
    injections.push('<script src="/__jotl/runtime.js"></script>')
  }
  injections.push('<script src="/__jotl/livereload.js"></script>')

  const tag = injections.join('\n')
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${tag}\n</body>`)
  } else {
    html += `\n${tag}\n`
  }

  return { html, script: script.trim(), styles: styles.join('\n\n').trim() }
}

function errorDocument(message: string): string {
  const safe = message
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>JOTLANG compile error</title></head>
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
      console.warn('[jotl] could not open browser:', error.message)
    }
  })
}
