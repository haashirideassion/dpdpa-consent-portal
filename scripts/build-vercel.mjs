import { cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { build } from 'esbuild'

// Clean previous Vercel output
rmSync('.vercel/output', { recursive: true, force: true })

// Vite build is run before this script via package.json: "vite build && node scripts/build-vercel.mjs"

// ---------- Create Vercel Build Output API v3 structure ----------

// Static assets → .vercel/output/static/
mkdirSync('.vercel/output/static', { recursive: true })
cpSync('dist/client', '.vercel/output/static', { recursive: true })

// Server function → .vercel/output/functions/index.func/
mkdirSync('.vercel/output/functions/index.func', { recursive: true })

// Copy the server assets (route chunks, manifests) — keep relative paths for dynamic imports
mkdirSync('.vercel/output/functions/index.func/server/assets', { recursive: true })
cpSync('dist/server/assets', '.vercel/output/functions/index.func/server/assets', { recursive: true })

// Bundle server.js with all npm dependencies inlined (only node: built-ins stay external)
// The assets/ chunks are kept as separate files and loaded via dynamic import() at runtime
console.log('Bundling server.js with esbuild...')
await build({
  entryPoints: ['dist/server/server.js'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.vercel/output/functions/index.func/server/server.js',
  // Keep Node.js built-ins external
  external: [
    'node:*',
    'async_hooks',
    'stream',
    'http',
    'https',
    'url',
    'net',
    'tls',
    'fs',
    'path',
    'os',
    'crypto',
    'buffer',
    'events',
    'util',
    'zlib',
    'querystring',
    'string_decoder',
    'child_process',
    'worker_threads',
    'perf_hooks',
    'v8',
    'vm',
  ],
  // Keep dynamic route chunk imports as-is (they live in ./assets/)
  plugins: [
    {
      name: 'external-assets',
      setup(build) {
        build.onResolve({ filter: /^\.\/assets\// }, args => ({
          path: args.path,
          external: true,
        }))
      },
    },
  ],
})
console.log('✓ Server bundle ready')

// server/ subdir needs ESM so dynamic import() resolves correctly
writeFileSync(
  '.vercel/output/functions/index.func/server/package.json',
  JSON.stringify({ type: 'module' })
)

// Adapter (CJS): Vercel's Nodejs launcher expects CommonJS.
// We use dynamic import() to load the ESM server bundle.
writeFileSync(
  '.vercel/output/functions/index.func/index.cjs',
  `'use strict'
const { Readable } = require('node:stream')

// Cache the ESM server module (loaded once per cold start)
let serverPromise = null
function getServer() {
  if (!serverPromise) {
    serverPromise = import('./server/server.js')
      .then(m => m.default)
      .catch(err => { throw new Error('SERVER_IMPORT_FAILED: ' + err?.message + '\\n' + err?.stack) })
  }
  return serverPromise
}

module.exports = async function handler(req, res) {
  let server
  try {
    server = await getServer()
  } catch (importErr) {
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain')
    res.end(\`Import Error: \${importErr?.message}\`)
    return
  }
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const url = \`\${protocol}://\${req.headers.host}\${req.url}\`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'connection') continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v)
    } else if (value) {
      headers.set(key, value)
    }
  }

  let body = null
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    if (chunks.length > 0) body = Buffer.concat(chunks)
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: body ?? undefined,
  })

  try {
    const response = await server.fetch(request)

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'transfer-encoding') res.setHeader(key, value)
    })

    if (response.body) {
      Readable.fromWeb(response.body).pipe(res)
    } else {
      res.end()
    }
  } catch (err) {
    console.error('[handler error]', err)
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain')
    res.end(\`Error: \${err?.message}\\n\\n\${err?.stack}\`)
  }
}
`
)

// Vercel function config — CJS handler, no streaming flag
writeFileSync(
  '.vercel/output/functions/index.func/.vc-config.json',
  JSON.stringify({
    runtime: 'nodejs20.x',
    handler: 'index.cjs',
    launcherType: 'Nodejs',
  })
)

// Routing: serve static files first, everything else → SSR function
writeFileSync(
  '.vercel/output/config.json',
  JSON.stringify({
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ],
  })
)

console.log('✓ Vercel output ready at .vercel/output/')
