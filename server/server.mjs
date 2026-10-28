// Serves the built app (dist/) for a Node host such as Render. It does three things a plain file
// server would not: sends the security headers the app needs (the same ones `vite preview` sends,
// read from dist/_headers, which the build writes), serves unknown paths as the app's index page
// so links like /blind-pot/abc work on reload, and sends the right file type for the WebAssembly
// wallet. No dependencies.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.PORT ?? 4173)

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found in ${root}. Run "npm run build" first.`)
  process.exit(1)
}

/** Reads `dist/_headers` ("/*" then "  Name: value" lines) into a header map. */
function readHeaders() {
  const headers = {}
  const file = join(root, '_headers')
  if (!existsSync(file)) {
    console.error('dist/_headers is missing: refusing to serve without the security headers.')
    process.exit(1)
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) headers[match[1]] = match[2].trim()
  }
  if (headers['Content-Security-Policy'] === undefined) {
    console.error('dist/_headers has no Content-Security-Policy: refusing to start.')
    process.exit(1)
  }
  return headers
}

const SECURITY_HEADERS = {
  ...readHeaders(),
  // The wallet starts its own worker threads from files on this origin.
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.webmanifest',
  '.svg',
  '.txt',
  '.ts',
])

function cacheControl(path) {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  // The wallet's files keep their names across builds, and its .js and .wasm must come from the same
  // one, so the browser asks each time (a 304 when nothing changed).
  if (path.startsWith('/wallet/')) return 'no-cache'
  return 'no-cache'
}

/** The file to send for a URL path, or null. Paths cannot climb out of dist/. */
function locate(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const file = normalize(join(root, decoded))
  if (file !== root && !file.startsWith(root + '/')) return null
  if (existsSync(file) && statSync(file).isFile()) return file
  return null
}

function send(req, res, file, path, status = 200) {
  const ext = extname(file)
  const { size, mtimeMs } = statSync(file)
  const etag = `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': cacheControl(path),
    ETag: etag,
    Vary: 'Accept-Encoding',
  }
  if (status === 200 && req.headers['if-none-match'] === etag) {
    delete headers['Content-Type']
    res.writeHead(304, headers)
    res.end()
    return
  }
  const gzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  if (gzip) headers['Content-Encoding'] = 'gzip'
  else headers['Content-Length'] = String(size)
  res.writeHead(status, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => res.destroy())
  if (gzip) stream.pipe(createGzip()).pipe(res)
  else stream.pipe(res)
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...SECURITY_HEADERS })
    res.end()
    return
  }
  const path = (req.url ?? '/').split('?')[0] ?? '/'
  if (path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    res.end('ok')
    return
  }
  const target = path.endsWith('/') ? `${path}index.html` : path
  const file = locate(target)
  if (file !== null) {
    send(req, res, file, path)
    return
  }
  // A path with a file extension that does not exist is a missing file; anything else is an app route.
  if (extname(path) !== '') {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS })
    res.end('Not found')
    return
  }
  send(req, res, join(root, 'index.html'), '/index.html')
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Zealed is serving ${root} on port ${String(port)}`)
})
