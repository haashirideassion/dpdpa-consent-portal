import { cpSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'

// Clean previous Vercel output
rmSync('.vercel/output', { recursive: true, force: true })

// Vite build is run before this script via package.json: "vite build && node scripts/build-vercel.mjs"

// ---------- Create Vercel Build Output API v3 structure ----------

// Static assets → .vercel/output/static/
mkdirSync('.vercel/output/static', { recursive: true })
cpSync('dist/client', '.vercel/output/static', { recursive: true })

// Server function → .vercel/output/functions/index.func/
mkdirSync('.vercel/output/functions/index.func', { recursive: true })

// Copy the full server bundle (server.js + assets/) into the function dir
// Keeping the relative paths intact so dynamic imports resolve correctly at runtime
cpSync('dist/server', '.vercel/output/functions/index.func/server', { recursive: true })

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
    serverPromise = import('./server/server.js').then(m => m.default)
  }
  return serverPromise
}

module.exports = async function handler(req, res) {
  const server = await getServer()
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
    res.end('Internal Server Error')
  }
}
`
)

// server/ subdir needs ESM so dynamic import() resolves correctly
writeFileSync(
  '.vercel/output/functions/index.func/server/package.json',
  JSON.stringify({ type: 'module' })
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
